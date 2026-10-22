"""会員向け API：チケット・ガチャ・抽選・景品・交換・獲得案件・お知らせ。"""

import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, OptionalUser, VerifiedUser, not_in_maintenance, rate_limit
from app.api.present import (
    awarded_gacha_ids,
    draw_out,
    exchange_out,
    gacha_detail,
    gacha_summary,
    load_gachas,
    prize_out,
)
from app.core import cache
from app.core.errors import NotFound
from app.models import (
    Announcement,
    ContactMessage,
    Draw,
    DrawResult,
    ExchangeRequest,
    Gacha,
    Notification,
    Offer,
    Prize,
    TicketTransaction,
    TicketWallet,
    User,
    UserPrize,
)
from app.models.enums import GachaStatus
from app.providers.registry import get_provider
from app.schemas import (
    AnnouncementOut,
    ContactIn,
    DrawIn,
    DrawOut,
    DrawSummaryOut,
    ExchangeIn,
    ExchangeOut,
    GachaDetailOut,
    GachaSummaryOut,
    Message,
    NotificationOut,
    OfferOut,
    Page,
    TicketTxOut,
    UserPrizeOut,
    WalletOut,
)
from app.services import draw_engine, offers, points, rewards, tickets
from app.services import exchange as exchange_svc
from app.services.audit import client_ip

router = APIRouter()
Maint = Depends(not_in_maintenance)


def paginate(page: int, per_page: int) -> tuple[int, int]:
    return (page - 1) * per_page, per_page


# ── ガチャ（公開） ───────────────────────────────────────


@router.get("/gachas", response_model=list[GachaSummaryOut], tags=["ガチャ"])
async def list_gachas(db: DB):
    async def load():
        gachas = await load_gachas(db, published_only=True)
        awarded = await awarded_gacha_ids(db, [g.id for g in gachas])
        out = [gacha_summary(g, awarded) for g in gachas]
        # 開催中を先に表示
        return sorted(out, key=lambda s: (not s.is_open,))

    # アクセス集中に備えて 1 秒だけキャッシュ（抽選の直後はそのワーカーのキャッシュを消す）
    return await cache.cached("gachas:list", 1.0, load)


@router.get("/gachas/{slug}", response_model=GachaDetailOut, tags=["ガチャ"])
async def get_gacha(slug: str, db: DB):
    async def load():
        gs = await load_gachas(db, slug=slug, published_only=True)
        if not gs:
            return None
        return gacha_detail(gs[0], await awarded_gacha_ids(db, [gs[0].id]))

    detail = await cache.cached(f"gachas:detail:{slug}", 1.0, load)
    if detail is None:
        raise NotFound("ガチャが見つかりません。")
    return detail


@router.post(
    "/gachas/{gacha_id}/draw",
    response_model=DrawOut,
    tags=["ガチャ"],
    summary="ガチャを引く（サーバー側で抽選し結果を確定・保存）",
    dependencies=[Maint, rate_limit("draw", 30, 60, "user")],
)
async def draw(gacha_id: int, body: DrawIn, user: VerifiedUser, db: DB):
    d, replayed = await draw_engine.execute_draw(db, user, gacha_id, body.count, body.idempotency_key)
    cache.invalidate("gachas:")  # 残り口数を最新にする
    return draw_out(d, await tickets.get_balance(db, user.id), replayed, await points.get_balance(db, user.id))


@router.get("/draws", response_model=Page[DrawSummaryOut], tags=["抽選履歴"])
async def my_draws(user: CurrentUser, db: DB, page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100)):
    off, lim = paginate(page, per_page)
    total = await db.scalar(select(func.count()).select_from(Draw).where(Draw.user_id == user.id))
    rows = (
        await db.execute(
            select(Draw, Gacha.title).join(Gacha, Gacha.id == Draw.gacha_id)
            .where(Draw.user_id == user.id).order_by(Draw.created_at.desc()).offset(off).limit(lim)
        )
    ).all()
    items = [
        DrawSummaryOut(id=d.id, gacha_id=d.gacha_id, gacha_title=t, count=d.count, tickets_spent=d.tickets_spent, points_won=d.points_won,
                       best_rarity=d.best_rarity, has_last_one=d.has_last_one, created_at=d.created_at)
        for d, t in rows
    ]
    return Page(items=items, total=total or 0, page=page, per_page=per_page)


@router.get("/draws/{draw_id}", response_model=DrawOut, tags=["抽選履歴"], summary="抽選結果の再取得（通信断時の復旧に使用）")
async def get_draw(draw_id: uuid.UUID, user: CurrentUser, db: DB):
    return draw_out(await draw_engine.load_draw(db, draw_id, user.id))


@router.get("/draws/by-key/{idempotency_key}", response_model=DrawOut, tags=["抽選履歴"], summary="冪等キーから抽選結果を取得")
async def get_draw_by_key(idempotency_key: str, user: CurrentUser, db: DB):
    did = await db.scalar(select(Draw.id).where(Draw.user_id == user.id, Draw.idempotency_key == idempotency_key))
    if did is None:
        raise NotFound("抽選結果が見つかりません。")
    return draw_out(await draw_engine.load_draw(db, did, user.id))


# ── チケット ─────────────────────────────────────────────


@router.get("/tickets/wallet", response_model=WalletOut, tags=["チケット"])
async def wallet(user: CurrentUser, db: DB):
    w = await db.get(TicketWallet, user.id)
    return WalletOut(balance=w.balance if w else 0, total_earned=w.total_earned if w else 0, total_spent=w.total_spent if w else 0)


@router.get("/tickets/transactions", response_model=Page[TicketTxOut], tags=["チケット"])
async def transactions(
    user: CurrentUser, db: DB,
    direction: Literal["all", "earn", "spend"] = "all",
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
):
    q = select(TicketTransaction).where(TicketTransaction.user_id == user.id)
    if direction == "earn":
        q = q.where(TicketTransaction.delta > 0)
    elif direction == "spend":
        q = q.where(TicketTransaction.delta < 0)
    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    off, lim = paginate(page, per_page)
    rows = (await db.execute(q.order_by(TicketTransaction.id.desc()).offset(off).limit(lim))).scalars()
    return Page(items=[TicketTxOut.model_validate(r) for r in rows], total=total or 0, page=page, per_page=per_page)


@router.get("/rewards/daily", tags=["チケット獲得"])
async def daily_status(user: CurrentUser, db: DB):
    return await rewards.daily_status(db, user.id)


@router.post("/rewards/daily", tags=["チケット獲得"], dependencies=[Maint, rate_limit("daily", 10, 60, "user")])
async def claim_daily(user: VerifiedUser, db: DB):
    res = await rewards.claim_daily(db, user)
    return {**res, "balance": await tickets.get_balance(db, user.id)}


@router.get("/missions", tags=["チケット獲得"])
async def missions(user: CurrentUser, db: DB):
    return await rewards.list_missions(db, user)


@router.post("/missions/{mission_id}/claim", tags=["チケット獲得"], dependencies=[Maint, rate_limit("mission", 20, 60, "user")])
async def claim_mission(mission_id: int, user: VerifiedUser, db: DB):
    amount = await rewards.claim_mission(db, user, mission_id)
    return {"amount": amount, "balance": await tickets.get_balance(db, user.id)}


@router.get("/offers", response_model=list[OfferOut], tags=["チケット獲得"])
async def list_offers(user: CurrentUser, db: DB, kind: Literal["ad", "survey", "video"] | None = None):
    q = select(Offer).where(Offer.is_active.is_(True))
    video_used = await offers.video_views_today(db, user.id)
    video_limit = await offers.video_daily_limit(db)
    if kind:
        q = q.where(Offer.kind == kind)
    out = []
    for o in (await db.execute(q.order_by(Offer.sort_order, Offer.id))).scalars():
        # 開発用の仮案件は、模擬事業者が有効な環境でのみ表示する
        if o.is_test and get_provider(o.provider) is None:
            continue
        if not offers.offer_available(o):
            continue
        earned = await offers.credited_count(db, user.id, o.id)
        out.append(OfferOut(
            id=o.id, kind=o.kind, title=o.title, description=o.description, conditions=o.conditions,
            image_url=o.image_url, reward_tickets=o.reward_tickets, estimated_minutes=o.estimated_minutes,
            is_test=o.is_test, earned_count=earned, per_user_limit=o.per_user_limit, ends_at=o.ends_at,
            daily_used=video_used if o.kind == "video" else None,
            daily_limit=video_limit if o.kind == "video" else None,
        ))
    return out


@router.post("/offers/{offer_id}/start", tags=["チケット獲得"], dependencies=[Maint, rate_limit("offer", 30, 60, "user")])
async def start_offer(offer_id: int, request: Request, user: VerifiedUser, db: DB):
    """案件への遷移 URL を発行する（click_id を埋め込み、成果通知と照合する）。"""
    click, url = await offers.create_click(db, user, offer_id, client_ip(request))
    return {"click_id": str(click.id), "url": url}


@router.post("/offers/clicks/{click_id}/simulate", tags=["チケット獲得"], summary="【開発用】模擬事業者の成果通知を発生させる")
async def simulate_conversion(click_id: uuid.UUID, user: VerifiedUser, db: DB, request: Request):
    from app.models import OfferClick
    from app.providers.registry import MOCK_PROVIDER

    provider = get_provider(MOCK_PROVIDER)
    if provider is None:
        raise NotFound()
    click = await db.get(OfferClick, click_id)
    if click is None or click.user_id != user.id:
        raise NotFound()
    params = offers.build_mock_postback(click.id)
    res = await offers.handle_postback(db, provider, params, {}, client_ip(request))
    return {"outcome": res.outcome, "balance": await tickets.get_balance(db, user.id)}


# ── 獲得景品・交換 ────────────────────────────────────────


@router.get("/prizes", response_model=Page[UserPrizeOut], tags=["景品"])
async def my_prizes(
    user: CurrentUser, db: DB,
    status: Literal["all", "owned", "exchange_pending", "exchanged"] = "all",
    rarity: Literal["N", "R", "SR", "SSR"] | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(30, ge=1, le=200),
):
    q = select(UserPrize, Prize, Gacha.title).join(Prize, Prize.id == UserPrize.prize_id).outerjoin(
        Gacha, Gacha.id == UserPrize.gacha_id
    ).where(UserPrize.user_id == user.id)
    if status != "all":
        q = q.where(UserPrize.status == status)
    if rarity:
        q = q.where(Prize.rarity == rarity)
    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    off, lim = paginate(page, per_page)
    rows = (await db.execute(q.order_by(UserPrize.acquired_at.desc(), UserPrize.id.desc()).offset(off).limit(lim))).all()
    items = [
        UserPrizeOut(id=up.id, prize=prize_out(p), source=up.source, status=up.status, gacha_title=t,
                     acquired_at=up.acquired_at, is_exchangeable=p.is_exchangeable, requires_shipping=p.requires_shipping)
        for up, p, t in rows
    ]
    return Page(items=items, total=total or 0, page=page, per_page=per_page)


@router.get("/prizes/summary", tags=["景品"])
async def prize_summary(user: CurrentUser, db: DB):
    rows = (await db.execute(
        select(Prize.rarity, UserPrize.status, func.count()).join(Prize, Prize.id == UserPrize.prize_id)
        .where(UserPrize.user_id == user.id).group_by(Prize.rarity, UserPrize.status)
    )).all()
    out: dict = {"by_rarity": {"N": 0, "R": 0, "SR": 0, "SSR": 0}, "by_status": {}}
    for rarity, st, n in rows:
        out["by_rarity"][rarity] += n
        out["by_status"][st] = out["by_status"].get(st, 0) + n
    return out


@router.get("/shipping-address", tags=["景品交換"])
async def saved_address(user: CurrentUser, db: DB):
    return {"address": await exchange_svc.get_saved_address(db, user.id)}


@router.post("/exchanges", response_model=ExchangeOut, status_code=201, tags=["景品交換"],
             dependencies=[Maint, rate_limit("exchange", 10, 60, "user")])
async def create_exchange(body: ExchangeIn, user: CurrentUser, db: DB):
    req, _ = await exchange_svc.create_request(
        db, user, body.user_prize_ids, body.shipping.model_dump() if body.shipping else None,
        body.idempotency_key, body.save_address, body.message,
    )
    return exchange_out(await exchange_svc.load_request(db, req.id, user.id))


@router.get("/exchanges", response_model=Page[ExchangeOut], tags=["景品交換"])
async def my_exchanges(user: CurrentUser, db: DB, page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100)):
    from app.models import ExchangeItem

    total = await db.scalar(select(func.count()).select_from(ExchangeRequest).where(ExchangeRequest.user_id == user.id))
    off, lim = paginate(page, per_page)
    rows = (await db.execute(
        select(ExchangeRequest).where(ExchangeRequest.user_id == user.id)
        .options(selectinload(ExchangeRequest.items).selectinload(ExchangeItem.user_prize).selectinload(UserPrize.prize))
        .order_by(ExchangeRequest.id.desc()).offset(off).limit(lim)
    )).scalars()
    return Page(items=[exchange_out(r) for r in rows], total=total or 0, page=page, per_page=per_page)


@router.get("/exchanges/{req_id}", response_model=ExchangeOut, tags=["景品交換"])
async def get_exchange(req_id: int, user: CurrentUser, db: DB):
    return exchange_out(await exchange_svc.load_request(db, req_id, user.id))


@router.post("/exchanges/{req_id}/cancel", response_model=ExchangeOut, tags=["景品交換"])
async def cancel_exchange(req_id: int, user: CurrentUser, db: DB):
    await exchange_svc.cancel_by_user(db, user, req_id)
    return exchange_out(await exchange_svc.load_request(db, req_id, user.id))


# ── お知らせ ─────────────────────────────────────────────


@router.get("/notifications", response_model=Page[NotificationOut], tags=["お知らせ"])
async def notifications(user: CurrentUser, db: DB, page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100)):
    total = await db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id))
    off, lim = paginate(page, per_page)
    rows = (await db.execute(
        select(Notification).where(Notification.user_id == user.id).order_by(Notification.id.desc()).offset(off).limit(lim)
    )).scalars()
    return Page(items=[NotificationOut.model_validate(r) for r in rows], total=total or 0, page=page, per_page=per_page)


@router.post("/notifications/read-all", response_model=Message, tags=["お知らせ"])
async def read_all(user: CurrentUser, db: DB):
    await db.execute(
        update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=datetime.now(UTC))
    )
    await db.commit()
    return Message(message="すべて既読にしました。")


_recent_cache: dict = {"at": 0.0, "data": []}


def _mask_name(name: str) -> str:
    name = (name or "").strip()
    return (name[:1] + "●●") if name else "●●"


@router.get("/recent-wins", tags=["ガチャ"], summary="最近の高レアリティ当選（ニックネームは伏せ字）")
async def recent_wins(response: Response, db: DB):
    """トップページの「最近の当選」表示用。アクセス集中に備えて 10 秒間キャッシュする。"""
    import time

    now = time.monotonic()
    if now - _recent_cache["at"] > 10:
        draws = (
            await db.execute(
                select(Draw.id, Draw.created_at, User.display_name, Gacha.title, Gacha.slug, Gacha.status)
                .join(User, User.id == Draw.user_id)
                .join(Gacha, Gacha.id == Draw.gacha_id)
                .where(Draw.best_rarity.in_(["SR", "SSR"]))
                .order_by(Draw.created_at.desc())
                .limit(20)
            )
        ).all()
        ids = [d.id for d in draws]
        best: dict = {}
        if ids:
            rows = (
                await db.execute(
                    select(DrawResult.draw_id, DrawResult.rarity, DrawResult.prize_name, DrawResult.is_last_one, Prize.image_url)
                    .join(Prize, Prize.id == DrawResult.prize_id)
                    .where(DrawResult.draw_id.in_(ids), DrawResult.rarity.in_(["SR", "SSR"]))
                )
            ).all()
            order = {"SSR": 2, "SR": 1}
            for r in rows:
                cur = best.get(r.draw_id)
                key = (r.is_last_one, order[r.rarity])
                if cur is None or key > (cur.is_last_one, order[cur.rarity]):
                    best[r.draw_id] = r
        _recent_cache["data"] = [
            {
                "id": str(d.id),
                "name": _mask_name(d.display_name),
                "gacha_title": d.title,
                # 公開を終えたガチャの詳細ページは見られないため、リンク先を返さない
                "gacha_slug": d.slug if d.status == GachaStatus.published else None,
                "rarity": best[d.id].rarity,
                "prize_name": best[d.id].prize_name,
                "image_url": best[d.id].image_url,
                "is_last_one": best[d.id].is_last_one,
                "created_at": d.created_at,
            }
            for d in draws
            if d.id in best
        ]
        _recent_cache["at"] = now
    response.headers["Cache-Control"] = "public, max-age=10"
    return _recent_cache["data"]


@router.get("/announcements", response_model=list[AnnouncementOut], tags=["お知らせ"])
async def announcements(db: DB, limit: int = Query(20, ge=1, le=100)):
    rows = (await db.execute(
        select(Announcement).where(Announcement.is_published.is_(True), Announcement.published_at <= datetime.now(UTC))
        .order_by(Announcement.published_at.desc()).limit(limit)
    )).scalars()
    return [AnnouncementOut.model_validate(r) for r in rows]


@router.post("/contact", response_model=Message, tags=["お問い合わせ"], dependencies=[rate_limit("contact", 5, 3600)])
async def contact(body: ContactIn, user: OptionalUser, db: DB):
    db.add(ContactMessage(user_id=user.id if user else None, name=body.name, email=body.email, category=body.category, body=body.body))
    await db.commit()
    return Message(message="お問い合わせを受け付けました。内容を確認のうえ、ご連絡いたします。")
