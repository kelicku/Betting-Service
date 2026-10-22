"""景品交換（発送）申請。"""

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import mail
from app.core.errors import AppError, NotFound
from app.core.security import decrypt_pii, encrypt_pii
from app.models import (
    ExchangeItem,
    ExchangeRequest,
    ExchangeStatusLog,
    Notification,
    Prize,
    ShippingAddress,
    User,
    UserPrize,
)
from app.models.enums import EXCHANGE_TRANSITIONS, ExchangeStatus, UserPrizeStatus
from app.services import settings_store

STATUS_LABELS = {
    ExchangeStatus.pending: "申請受付",
    ExchangeStatus.approved: "承認済み",
    ExchangeStatus.preparing: "発送準備中",
    ExchangeStatus.shipped: "発送済み",
    ExchangeStatus.completed: "完了",
    ExchangeStatus.rejected: "却下",
    ExchangeStatus.cancelled: "取消",
}

SHIPPING_FIELDS = ("name", "postal_code", "prefecture", "address1", "address2", "phone", "note")


def mask_name(name: str) -> str:
    name = name.strip()
    if not name:
        return ""
    parts = name.replace("　", " ").split(" ")
    return parts[0] + " ●●" if len(parts) > 1 else name[0] + "●●"


def load_shipping(encrypted: str | None) -> dict | None:
    if not encrypted:
        return None
    plain = decrypt_pii(encrypted)
    return json.loads(plain) if plain else None


async def get_saved_address(db: AsyncSession, user_id: int) -> dict | None:
    row = await db.get(ShippingAddress, user_id)
    return load_shipping(row.encrypted) if row else None


async def create_request(
    db: AsyncSession,
    user: User,
    user_prize_ids: list[int],
    shipping: dict | None,
    idempotency_key: str,
    save_address: bool,
    message: str | None,
) -> tuple[ExchangeRequest, bool]:
    if not user_prize_ids:
        raise AppError("no_items", "交換する景品を選択してください。")
    if len(set(user_prize_ids)) != len(user_prize_ids) or len(user_prize_ids) > 50:
        raise AppError("invalid_items", "景品の指定が正しくありません。")
    if await settings_store.get(db, "exchange_requires_verified_email") and not user.email_verified_at:
        raise AppError("email_not_verified", "景品交換にはメールアドレスの確認が必要です。", 403)

    existing = await db.scalar(
        select(ExchangeRequest).where(
            ExchangeRequest.user_id == user.id, ExchangeRequest.idempotency_key == idempotency_key
        )
    )
    if existing:
        return existing, True

    # 対象景品の行をロックし、所持中（owned）であることを確認
    rows = list(
        (
            await db.execute(
                select(UserPrize, Prize)
                .join(Prize, Prize.id == UserPrize.prize_id)
                .where(UserPrize.id.in_(user_prize_ids), UserPrize.user_id == user.id)
                .order_by(UserPrize.id)
                .with_for_update(of=UserPrize)
            )
        ).all()
    )
    if len(rows) != len(user_prize_ids):
        raise NotFound("指定された景品が見つかりません。")
    # ロック待ちの間に同じ冪等キーの申請が確定していないか再確認
    existing = await db.scalar(
        select(ExchangeRequest).where(
            ExchangeRequest.user_id == user.id, ExchangeRequest.idempotency_key == idempotency_key
        )
    )
    if existing:
        return existing, True
    for up, prize in rows:
        if up.status != UserPrizeStatus.owned:
            raise AppError(
                "already_requested", f"「{prize.name}」は既に交換申請済みです。", status_code=409
            )
        if not prize.is_exchangeable:
            raise AppError("not_exchangeable", f"「{prize.name}」は交換対象外の景品です。")

    needs_shipping = any(p.requires_shipping for _, p in rows)
    encrypted = None
    masked = None
    if needs_shipping:
        if not shipping:
            raise AppError("shipping_required", "配送先を入力してください。")
        clean = {k: (shipping.get(k) or "").strip() for k in SHIPPING_FIELDS}
        encrypted = encrypt_pii(json.dumps(clean, ensure_ascii=False))
        masked = mask_name(clean["name"])
        if save_address:
            row = await db.get(ShippingAddress, user.id)
            if row:
                row.encrypted = encrypted
            else:
                db.add(ShippingAddress(user_id=user.id, encrypted=encrypted))

    req = ExchangeRequest(
        user_id=user.id,
        status=ExchangeStatus.pending,
        idempotency_key=idempotency_key,
        shipping_encrypted=encrypted,
        recipient_masked=masked,
        user_message=(message or None),
    )
    db.add(req)
    await db.flush()
    for up, _ in rows:
        up.status = UserPrizeStatus.exchange_pending
        db.add(ExchangeItem(request_id=req.id, user_prize_id=up.id))
    db.add(ExchangeStatusLog(request_id=req.id, from_status=None, to_status=ExchangeStatus.pending, actor_id=user.id))
    db.add(
        Notification(
            user_id=user.id,
            kind="exchange",
            title="景品交換の申請を受け付けました",
            body=f"申請番号 #{req.id}（{len(rows)}点）。処理状況は交換履歴からご確認いただけます。",
            link=f"/exchanges/{req.id}",
        )
    )
    # 部分一意インデックス uq_exchange_items_active_prize が二重申請の最終防衛線
    await db.commit()
    return req, False


async def _release_items(db: AsyncSession, req_id: int) -> None:
    ids = [
        r
        for r in (
            await db.execute(
                select(ExchangeItem.user_prize_id).where(
                    ExchangeItem.request_id == req_id, ExchangeItem.active.is_(True)
                )
            )
        ).scalars()
    ]
    await db.execute(
        update(ExchangeItem).where(ExchangeItem.request_id == req_id).values(active=False)
    )
    if ids:
        await db.execute(
            update(UserPrize).where(UserPrize.id.in_(ids)).values(status=UserPrizeStatus.owned)
        )


async def _lock_request(db: AsyncSession, req_id: int, user_id: int | None = None) -> ExchangeRequest:
    q = select(ExchangeRequest).where(ExchangeRequest.id == req_id).with_for_update()
    if user_id is not None:
        q = q.where(ExchangeRequest.user_id == user_id)
    req = (await db.execute(q.execution_options(populate_existing=True))).scalar_one_or_none()
    if req is None:
        raise NotFound("交換申請が見つかりません。")
    return req


async def cancel_by_user(db: AsyncSession, user: User, req_id: int) -> ExchangeRequest:
    req = await _lock_request(db, req_id, user.id)
    if req.status != ExchangeStatus.pending:
        raise AppError("cannot_cancel", "承認済みの申請は取り消せません。お問い合わせください。", 409)
    await _release_items(db, req.id)
    db.add(ExchangeStatusLog(request_id=req.id, from_status=req.status, to_status=ExchangeStatus.cancelled, actor_id=user.id))
    req.status = ExchangeStatus.cancelled
    await db.commit()
    return req


async def transition(
    db: AsyncSession,
    actor: User,
    req_id: int,
    to: ExchangeStatus,
    note: str | None = None,
    carrier: str | None = None,
    tracking_number: str | None = None,
) -> ExchangeRequest:
    req = await _lock_request(db, req_id)
    current = ExchangeStatus(req.status)
    if to not in EXCHANGE_TRANSITIONS[current]:
        raise AppError(
            "invalid_transition",
            f"「{STATUS_LABELS[current]}」から「{STATUS_LABELS[to]}」には変更できません。",
            409,
        )
    t = datetime.now(UTC)
    if to == ExchangeStatus.rejected:
        await _release_items(db, req.id)
    elif to == ExchangeStatus.approved:
        req.approved_at = t
    elif to == ExchangeStatus.shipped:
        req.shipped_at = t
        req.carrier = carrier or req.carrier
        req.tracking_number = tracking_number or req.tracking_number
        item_ids = select(ExchangeItem.user_prize_id).where(
            ExchangeItem.request_id == req.id, ExchangeItem.active.is_(True)
        )
        await db.execute(
            update(UserPrize).where(UserPrize.id.in_(item_ids)).values(status=UserPrizeStatus.exchanged)
        )
    elif to == ExchangeStatus.completed:
        req.completed_at = t
    if note:
        req.admin_note = note
    db.add(ExchangeStatusLog(request_id=req.id, from_status=current, to_status=to, actor_id=actor.id, note=note))
    req.status = to
    body = f"申請番号 #{req.id} の状態が「{STATUS_LABELS[to]}」になりました。"
    if to == ExchangeStatus.shipped and req.tracking_number:
        body += f"\n配送業者：{req.carrier or '-'}　お問い合わせ番号：{req.tracking_number}"
    if to == ExchangeStatus.rejected and note:
        body += f"\n理由：{note}"
    db.add(Notification(user_id=req.user_id, kind="exchange", title="景品交換の状況が更新されました", body=body, link=f"/exchanges/{req.id}"))
    owner = await db.get(User, req.user_id)
    await db.commit()
    if owner:
        await mail.send_mail(owner.email, "【わくわくガチャ】景品交換の状況が更新されました", f"{owner.display_name} 様\n\n{body}")
    return req


async def load_request(db: AsyncSession, req_id: int, user_id: int | None = None) -> ExchangeRequest:
    q = (
        select(ExchangeRequest)
        .where(ExchangeRequest.id == req_id)
        .options(
            selectinload(ExchangeRequest.items)
            .selectinload(ExchangeItem.user_prize)
            .selectinload(UserPrize.prize)
        )
    )
    if user_id is not None:
        q = q.where(ExchangeRequest.user_id == user_id)
    req = (await db.execute(q)).scalar_one_or_none()
    if req is None:
        raise NotFound("交換申請が見つかりません。")
    return req


async def purge_expired_pii(db: AsyncSession) -> int:
    """完了・却下・取消から保持期間を過ぎた申請の配送先情報を消去する。"""
    days = await settings_store.get(db, "pii_retention_days")
    cutoff = datetime.now(UTC) - timedelta(days=days)
    res = await db.execute(
        update(ExchangeRequest)
        .where(
            ExchangeRequest.status.in_(
                [ExchangeStatus.completed, ExchangeStatus.rejected, ExchangeStatus.cancelled]
            ),
            ExchangeRequest.updated_at < cutoff,
            ExchangeRequest.pii_purged_at.is_(None),
            ExchangeRequest.shipping_encrypted.is_not(None),
        )
        .values(shipping_encrypted=None, pii_purged_at=datetime.now(UTC))
    )
    await db.commit()
    return res.rowcount or 0
