"""広告・アンケート案件と、成果通知によるチケット付与。"""

import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFound
from app.models import Conversion, Notification, Offer, OfferClick, PostbackLog, User
from app.models.enums import ConversionStatus, OfferKind, TicketKind, UserStatus
from app.providers.base import BaseProvider, PostbackData, PostbackRejected
from app.providers.hmac_generic import sign
from app.providers.registry import MOCK_PROVIDER, mock_secret
from app.services import settings_store, tickets

JST = timezone(timedelta(hours=9))


def offer_available(offer: Offer, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    if not offer.is_active:
        return False
    if offer.starts_at and now < offer.starts_at:
        return False
    if offer.ends_at and now >= offer.ends_at:
        return False
    return True


async def credited_count(db: AsyncSession, user_id: int, offer_id: int) -> int:
    return await db.scalar(
        select(func.count()).select_from(Conversion).where(
            Conversion.user_id == user_id,
            Conversion.offer_id == offer_id,
            Conversion.status == ConversionStatus.credited,
        )
    ) or 0


def jst_day_start(now: datetime | None = None) -> datetime:
    """日本時間の今日の 0:00（動画リワード広告の視聴回数のリセット時刻）。"""
    n = (now or datetime.now(UTC)).astimezone(JST)
    return n.replace(hour=0, minute=0, second=0, microsecond=0)


async def video_views_today(db: AsyncSession, user_id: int) -> int:
    """今日（日本時間）チケットを付与した動画リワード広告の視聴回数（すべての動画案件の合計）。"""
    return await db.scalar(
        select(func.count()).select_from(Conversion).where(
            Conversion.user_id == user_id,
            Conversion.kind == OfferKind.video,
            Conversion.status == ConversionStatus.credited,
            Conversion.received_at >= jst_day_start(),
        )
    ) or 0


async def video_daily_limit(db: AsyncSession) -> int:
    return int(await settings_store.get(db, "video_daily_limit"))


async def create_click(db: AsyncSession, user: User, offer_id: int, ip: str | None) -> tuple[OfferClick, str]:
    offer = await db.get(Offer, offer_id)
    if offer is None or not offer_available(offer):
        raise NotFound("この案件は現在ご利用いただけません。")
    if offer.kind == OfferKind.video:
        limit = await video_daily_limit(db)
        if await video_views_today(db, user.id) >= limit:
            raise AppError("video_daily_limit", f"動画の視聴は 1 日 {limit} 回までです。明日（0:00 以降）またご利用ください。", 409)
    elif await credited_count(db, user.id, offer.id) >= offer.per_user_limit:
        raise AppError("offer_limit", "この案件の報酬は既に獲得済みです。", 409)
    click = OfferClick(user_id=user.id, offer_id=offer.id, ip=ip)
    db.add(click)
    await db.commit()
    url = offer.url_template.replace("{click_id}", str(click.id)).replace("{user_ref}", f"u{user.id}")
    return click, url


@dataclass
class PostbackOutcome:
    outcome: str
    http_status: int
    conversion_id: int | None = None


async def _log(db: AsyncSession, provider: str, outcome: str, detail: str | None, ip: str | None, params: dict) -> None:
    safe = {k: v for k, v in params.items() if k != "sig"}
    db.add(PostbackLog(provider=provider, outcome=outcome, detail=(detail or "")[:200], ip=ip, params=safe))


async def handle_postback(
    db: AsyncSession, provider: BaseProvider, params: dict[str, str], headers: dict[str, str], ip: str | None
) -> PostbackOutcome:
    """成果通知を処理する。すべての受信は PostbackLog に記録される。"""
    try:
        data: PostbackData = provider.parse(params, headers, ip)
    except PostbackRejected as e:
        await _log(db, provider.name, e.outcome, e.detail, ip, params)
        await db.commit()
        return PostbackOutcome(e.outcome, e.http_status)

    if data.status == "pending":
        await _log(db, provider.name, "pending_ignored", data.conversion_id, ip, params)
        await db.commit()
        return PostbackOutcome("pending_ignored", 200)

    # click_id の照合
    try:
        click_uuid = uuid.UUID(data.click_id)
    except ValueError:
        click_uuid = None
    click = await db.get(OfferClick, click_uuid) if click_uuid else None
    offer = await db.get(Offer, click.offer_id) if click else None

    reject_reason: str | None = None
    if click is None or offer is None:
        reject_reason = "unknown_click"
    elif offer.provider != provider.name:
        reject_reason = "provider_mismatch"
    elif offer.is_test != provider.is_test:
        reject_reason = "test_mismatch"
    elif data.status == "rejected":
        reject_reason = "rejected_by_provider"

    user = await db.get(User, click.user_id) if click else None
    if reject_reason is None and (user is None or user.status != UserStatus.active):
        reject_reason = "user_inactive"

    # 重複通知の判定（provider, conversion_id の一意制約）
    stmt = (
        insert(Conversion)
        .values(
            provider=provider.name,
            external_conversion_id=data.conversion_id,
            kind=offer.kind if offer else OfferKind.ad,
            click_id=click.id if click else None,
            user_id=click.user_id if click else None,
            offer_id=offer.id if offer else None,
            status=ConversionStatus.rejected if reject_reason else ConversionStatus.credited,
            reject_reason=reject_reason,
            reward_tickets=0,
            payout=data.payout,
            is_test=provider.is_test,
            raw=data.raw,
        )
        .on_conflict_do_nothing(index_elements=["provider", "external_conversion_id"])
        .returning(Conversion.id)
    )
    conv_id = (await db.execute(stmt)).scalar_one_or_none()
    if conv_id is None:
        await db.execute(
            update(Conversion)
            .where(Conversion.provider == provider.name, Conversion.external_conversion_id == data.conversion_id)
            .values(duplicate_count=Conversion.duplicate_count + 1)
        )
        await _log(db, provider.name, "duplicate", data.conversion_id, ip, params)
        await db.commit()
        # 事業者側の再送を止めるため 200 を返す
        return PostbackOutcome("duplicate", 200)

    conv = await db.get(Conversion, conv_id)
    assert conv is not None
    if reject_reason is None:
        assert user is not None and offer is not None
        # 1 ユーザーあたりの獲得上限（ウォレットロックで直列化してから数える）
        await tickets.lock_wallet(db, user.id)
        if offer.kind == OfferKind.video:
            # 動画リワード広告は 1 日の視聴回数の上限（今回の通知を含めて数える）。画面で止めていても、通知側でも必ず確認する
            over = await video_views_today(db, user.id) > await video_daily_limit(db)
            over_reason = "daily_limit"
        else:
            over = await credited_count(db, user.id, offer.id) > offer.per_user_limit
            over_reason = "per_user_limit"
        if over:
            conv.status = ConversionStatus.rejected
            conv.reject_reason = over_reason
            reject_reason = over_reason
        else:
            kind = TicketKind.survey if offer.kind == OfferKind.survey else TicketKind.ad
            label = {OfferKind.survey: "アンケート回答", OfferKind.video: "動画視聴"}.get(offer.kind, "案件達成")
            tx = await tickets.credit(
                db, user.id, offer.reward_tickets, kind,
                f"{label}：{offer.title}" + ("（テスト）" if provider.is_test else ""),
                dedupe_key=f"conv:{provider.name}:{data.conversion_id}",
                ref_type="conversion", ref_id=str(conv.id), is_test=provider.is_test,
            )
            conv.reward_tickets = offer.reward_tickets
            conv.ticket_transaction_id = tx.id if tx else None
            db.add(
                Notification(
                    user_id=user.id,
                    kind="reward",
                    title="チケットを獲得しました",
                    body=f"「{offer.title}」の成果が確認され、チケット{offer.reward_tickets}枚を付与しました。",
                    link="/tickets",
                )
            )
    await _log(db, provider.name, reject_reason or "credited", data.conversion_id, ip, params)
    await db.commit()
    return PostbackOutcome(reject_reason or "credited", 200, conv_id)


def build_mock_postback(click_id: uuid.UUID, status: str = "approved") -> dict[str, str]:
    """開発用：模擬事業者からの署名付き成果通知パラメータを作る。"""
    params = {
        "click_id": str(click_id),
        "conversion_id": f"mock-{uuid.uuid4().hex[:16]}",
        "status": status,
        "payout": "0",
        "ts": str(int(time.time())),
    }
    params["sig"] = sign(params, mock_secret())
    return params


def is_mock(offer: Offer) -> bool:
    return offer.provider == MOCK_PROVIDER
