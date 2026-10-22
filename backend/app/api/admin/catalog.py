"""管理 API：景品・ガチャ・在庫・ラストワン賞・抽選履歴・案件・ミッション・交換申請。"""

import uuid
from typing import Literal

from fastapi import APIRouter, File, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.admin.common import paged, row_dict
from app.api.admin.schemas import (
    BannerIn,
    ExchangeTransitionIn,
    GachaIn,
    GachaItemsIn,
    GachaStatusIn,
    MissionIn,
    OfferIn,
    PrizeIn,
    StockAdjustIn,
)
from app.api.deps import DB, AdminUser, StaffUser
from app.api.present import item_probabilities
from app.core.errors import AppError, NotFound
from app.core.storage import save_image
from app.models import (
    Banner,
    Conversion,
    Draw,
    DrawResult,
    ExchangeItem,
    ExchangeRequest,
    Gacha,
    GachaItem,
    LastOneAward,
    Mission,
    NewsletterSubscription,
    Offer,
    PostbackLog,
    Prize,
    User,
    UserPrize,
)
from app.models.enums import EXCHANGE_TRANSITIONS, ExchangeStatus, GachaMode, GachaStatus
from app.providers.registry import provider_names
from app.services import draw_engine
from app.services import exchange as exchange_svc
from app.services.audit import audit

router = APIRouter()

PRIZE_FIELDS = ("id", "name", "description", "image_url", "rarity", "is_exchangeable", "requires_shipping", "reference_value_yen", "is_active", "subtitle", "is_featured", "featured_order", "point_value", "created_at", "updated_at")
GACHA_FIELDS = ("id", "slug", "title", "subtitle", "description", "banner_image_url", "theme_color", "ticket_cost", "mode", "status", "starts_at", "ends_at", "max_pulls", "pulls_done", "allow_multi_10", "allow_multi_100", "last_one_prize_id", "last_one_description", "sort_order", "badge", "created_at", "updated_at")


# ── 画像アップロード ─────────────────────────────────────


@router.post("/uploads")
async def upload(_: AdminUser, file: UploadFile = File(...), folder: Literal["prizes", "gachas", "offers"] = "prizes"):
    data = await file.read()
    return {"url": save_image(data, folder)}


# ── 景品 ─────────────────────────────────────────────


@router.get("/prizes")
async def list_prizes(
    _: StaffUser, db: DB, q: str | None = None, rarity: str | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500),
):
    stmt = select(Prize)
    if q:
        stmt = stmt.where(Prize.name.ilike(f"%{q}%"))
    if rarity:
        stmt = stmt.where(Prize.rarity == rarity)
    rows, meta = await paged(db, stmt.order_by(Prize.id.desc()), page, per_page)
    return {"items": [row_dict(p, *PRIZE_FIELDS) for p in rows], **meta}


@router.post("/prizes", status_code=201)
async def create_prize(body: PrizeIn, admin: AdminUser, request: Request, db: DB):
    p = Prize(**body.model_dump())
    db.add(p)
    await db.flush()
    audit(db, admin, "prize.create", "prize", p.id, body.model_dump(), request)
    await db.commit()
    await db.refresh(p)
    return row_dict(p, *PRIZE_FIELDS)


@router.put("/prizes/{prize_id}")
async def update_prize(prize_id: int, body: PrizeIn, admin: AdminUser, request: Request, db: DB):
    p = await db.get(Prize, prize_id)
    if p is None:
        raise NotFound("景品が見つかりません。")
    before = row_dict(p, *body.model_dump().keys())
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    audit(db, admin, "prize.update", "prize", p.id, {"before": before, "after": body.model_dump()}, request)
    await db.commit()
    await db.refresh(p)
    return row_dict(p, *PRIZE_FIELDS)


# ── ガチャ ─────────────────────────────────────────────


async def _gacha(db, gacha_id: int, lock: bool = False) -> Gacha:
    q = select(Gacha).where(Gacha.id == gacha_id)
    if lock:
        q = q.with_for_update()
    g = (await db.execute(q.execution_options(populate_existing=True))).scalar_one_or_none()
    if g is None:
        raise NotFound("ガチャが見つかりません。")
    return g


async def gacha_admin_out(db, g: Gacha) -> dict:
    items = list((await db.execute(
        select(GachaItem).where(GachaItem.gacha_id == g.id).options(selectinload(GachaItem.prize)).order_by(GachaItem.sort_order, GachaItem.id)
    )).scalars())
    probs = item_probabilities(g, items)
    award = await db.scalar(select(LastOneAward).where(LastOneAward.gacha_id == g.id))
    return {
        **row_dict(g, *GACHA_FIELDS),
        "remaining": draw_engine.remaining_pulls(g, items),
        "has_last_one": draw_engine.has_last_one(g),
        "is_open": draw_engine.is_open(g),
        "last_one_award": row_dict(award, "user_id", "draw_id", "prize_id", "awarded_at") if award else None,
        "items": [
            {
                **row_dict(i, "id", "prize_id", "weight", "stock_total", "stock_remaining", "sort_order", "is_active"),
                "prize": row_dict(i.prize, "id", "name", "rarity", "image_url"),
                "probability": probs.get(i.id, 0.0),
            }
            for i in items
        ],
    }


@router.get("/gachas")
async def list_gachas(_: StaffUser, db: DB, status: str | None = None):
    q = select(Gacha)
    if status:
        q = q.where(Gacha.status == status)
    gs = (await db.execute(q.order_by(Gacha.sort_order, Gacha.id.desc()))).scalars().all()
    return {"items": [await gacha_admin_out(db, g) for g in gs]}


@router.get("/gachas/{gacha_id}")
async def get_gacha(gacha_id: int, _: StaffUser, db: DB):
    return await gacha_admin_out(db, await _gacha(db, gacha_id))


def _validate_last_one(body: GachaIn) -> None:
    if body.last_one_prize_id and body.mode == GachaMode.probability and body.max_pulls is None:
        raise AppError(
            "last_one_needs_limit",
            "確率抽選方式でラストワン賞を設定するには、総口数（max_pulls）を設定してください。",
        )


@router.post("/gachas", status_code=201)
async def create_gacha(body: GachaIn, admin: AdminUser, request: Request, db: DB):
    _validate_last_one(body)
    if await db.scalar(select(Gacha.id).where(Gacha.slug == body.slug)):
        raise AppError("slug_taken", "このスラッグは既に使われています。", 409)
    g = Gacha(**body.model_dump(), status=GachaStatus.draft)
    db.add(g)
    await db.flush()
    audit(db, admin, "gacha.create", "gacha", g.id, body.model_dump(mode="json"), request)
    await db.commit()
    return await gacha_admin_out(db, await _gacha(db, g.id))


@router.put("/gachas/{gacha_id}")
async def update_gacha(gacha_id: int, body: GachaIn, admin: AdminUser, request: Request, db: DB):
    _validate_last_one(body)
    g = await _gacha(db, gacha_id, lock=True)
    if g.pulls_done > 0:
        if body.mode != g.mode:
            raise AppError("locked_field", "抽選済みのガチャは抽選方式を変更できません。", 409)
        if body.max_pulls is not None and body.max_pulls < g.pulls_done:
            raise AppError("locked_field", f"総口数は抽選済みの口数（{g.pulls_done}口）以上にしてください。", 409)
        if body.last_one_prize_id != g.last_one_prize_id and await db.scalar(select(LastOneAward.id).where(LastOneAward.gacha_id == g.id)):
            raise AppError("locked_field", "ラストワン賞は既に付与済みのため変更できません。", 409)
    if body.slug != g.slug and await db.scalar(select(Gacha.id).where(Gacha.slug == body.slug)):
        raise AppError("slug_taken", "このスラッグは既に使われています。", 409)
    before = row_dict(g, *body.model_dump().keys())
    for k, v in body.model_dump().items():
        setattr(g, k, v)
    audit(db, admin, "gacha.update", "gacha", g.id, {"before": {k: str(v) for k, v in before.items()}, "after": body.model_dump(mode="json")}, request)
    await db.commit()
    return await gacha_admin_out(db, await _gacha(db, g.id))


@router.put("/gachas/{gacha_id}/items")
async def set_items(gacha_id: int, body: GachaItemsIn, admin: AdminUser, request: Request, db: DB):
    """景品構成と当選確率（重み）・在庫数を設定する。抽選開始後は在庫総数を直接変更できず、在庫調整 API を使う。"""
    g = await _gacha(db, gacha_id, lock=True)
    existing = {i.prize_id: i for i in (await db.execute(
        select(GachaItem).where(GachaItem.gacha_id == g.id).with_for_update()
    )).scalars()}
    prize_ids = [i.prize_id for i in body.items]
    if len(set(prize_ids)) != len(prize_ids):
        raise AppError("duplicate_prize", "同じ景品が複数指定されています。")
    found = set((await db.execute(select(Prize.id).where(Prize.id.in_(prize_ids)))).scalars())
    if missing := set(prize_ids) - found:
        raise AppError("unknown_prize", f"存在しない景品が指定されています：{sorted(missing)}")
    if g.mode == GachaMode.box and any(i.stock_total is None for i in body.items if i.is_active):
        raise AppError("box_needs_stock", "ボックス方式では、すべての景品に在庫数を設定してください。")
    started = g.pulls_done > 0
    for spec in body.items:
        cur = existing.pop(spec.prize_id, None)
        if cur is None:
            db.add(GachaItem(gacha_id=g.id, prize_id=spec.prize_id, weight=spec.weight, stock_total=spec.stock_total,
                             stock_remaining=spec.stock_total, sort_order=spec.sort_order, is_active=spec.is_active))
            continue
        if spec.stock_total != cur.stock_total:
            if started:
                raise AppError("locked_field", "抽選開始後の在庫数は「在庫調整」から変更してください。", 409)
            cur.stock_total = spec.stock_total
            cur.stock_remaining = spec.stock_total
        cur.weight = spec.weight
        cur.sort_order = spec.sort_order
        cur.is_active = spec.is_active
    for leftover in existing.values():
        used = await db.scalar(select(func.count()).select_from(DrawResult).where(DrawResult.gacha_item_id == leftover.id))
        if used:
            leftover.is_active = False  # 抽選履歴がある景品は削除せず無効化
        else:
            await db.delete(leftover)
    audit(db, admin, "gacha.items", "gacha", g.id, {"items": [i.model_dump() for i in body.items]}, request)
    await db.commit()
    return await gacha_admin_out(db, await _gacha(db, g.id))


@router.post("/gachas/{gacha_id}/stock")
async def adjust_stock(gacha_id: int, body: StockAdjustIn, admin: AdminUser, request: Request, db: DB):
    """在庫の追加・減少。抽選と同じロック順序（ガチャ → 景品）で直列化する。"""
    g = await _gacha(db, gacha_id, lock=True)
    item = (await db.execute(
        select(GachaItem).where(GachaItem.id == body.item_id, GachaItem.gacha_id == g.id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if item is None:
        raise NotFound("景品が見つかりません。")
    if item.stock_total is None:
        raise AppError("unlimited", "在庫無制限の景品は在庫調整できません。")
    if item.stock_remaining + body.delta < 0:
        raise AppError("negative_stock", f"残り在庫（{item.stock_remaining}）を超えて減らすことはできません。")
    item.stock_total += body.delta
    item.stock_remaining += body.delta
    audit(db, admin, "gacha.stock", "gacha", g.id, {"item_id": item.id, "delta": body.delta, "reason": body.reason,
                                                    "stock_remaining": item.stock_remaining}, request)
    await db.commit()
    return await gacha_admin_out(db, await _gacha(db, g.id))


@router.post("/gachas/{gacha_id}/status")
async def set_status(gacha_id: int, body: GachaStatusIn, admin: AdminUser, request: Request, db: DB):
    g = await _gacha(db, gacha_id, lock=True)
    if body.status == GachaStatus.published:
        items = list((await db.execute(select(GachaItem).where(GachaItem.gacha_id == g.id, GachaItem.is_active.is_(True)))).scalars())
        if not items:
            raise AppError("no_items", "景品が設定されていないため公開できません。")
        if g.mode == GachaMode.probability and sum(i.weight for i in items) <= 0:
            raise AppError("no_weight", "当選確率（重み）の合計が 0 のため公開できません。")
        if g.mode == GachaMode.box and sum(i.stock_remaining or 0 for i in items) <= 0:
            raise AppError("no_stock", "在庫がないため公開できません。")
    old = g.status
    g.status = body.status
    audit(db, admin, "gacha.status", "gacha", g.id, {"from": old, "to": body.status}, request)
    await db.commit()
    return await gacha_admin_out(db, await _gacha(db, g.id))


# ── 抽選履歴・ラストワン賞 ─────────────────────────────────


@router.get("/draws")
async def list_draws(
    _: StaffUser, db: DB, gacha_id: int | None = None, user_id: int | None = None,
    last_one: bool | None = None, rarity: str | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
):
    q = select(Draw, Gacha.title, User.email).join(Gacha, Gacha.id == Draw.gacha_id).join(User, User.id == Draw.user_id)
    if gacha_id:
        q = q.where(Draw.gacha_id == gacha_id)
    if user_id:
        q = q.where(Draw.user_id == user_id)
    if last_one is not None:
        q = q.where(Draw.has_last_one.is_(last_one))
    if rarity:
        q = q.where(Draw.best_rarity == rarity)
    rows, meta = await paged(db, q.order_by(Draw.created_at.desc()), page, per_page, scalars=False)
    return {
        "items": [
            {**row_dict(d, "id", "user_id", "gacha_id", "count", "tickets_spent", "best_rarity", "has_last_one", "created_at"),
             "gacha_title": t, "email": e}
            for d, t, e in rows
        ],
        **meta,
    }


@router.get("/draws/{draw_id}")
async def draw_detail(draw_id: uuid.UUID, _: StaffUser, db: DB):
    d = await draw_engine.load_draw(db, draw_id)
    return {
        **row_dict(d, "id", "user_id", "gacha_id", "count", "tickets_spent", "best_rarity", "has_last_one", "idempotency_key", "created_at"),
        "gacha_title": d.gacha.title,
        "digest_valid": draw_engine.verify_digest(d, d.results),
        "results": [row_dict(r, "position", "prize_id", "prize_name", "rarity", "is_last_one") for r in d.results],
    }


@router.get("/last-one-awards")
async def last_one_awards(_: StaffUser, db: DB):
    rows = (await db.execute(
        select(LastOneAward, Gacha.title, User.email, Prize.name)
        .join(Gacha, Gacha.id == LastOneAward.gacha_id).join(User, User.id == LastOneAward.user_id)
        .join(Prize, Prize.id == LastOneAward.prize_id).order_by(LastOneAward.awarded_at.desc())
    )).all()
    return {"items": [
        {**row_dict(a, "id", "gacha_id", "user_id", "draw_id", "prize_id", "awarded_at"), "gacha_title": t, "email": e, "prize_name": pn}
        for a, t, e, pn in rows
    ]}


# ── 広告・アンケート案件 ───────────────────────────────────

OFFER_FIELDS = ("id", "provider", "kind", "external_id", "title", "description", "conditions", "image_url", "url_template",
                "reward_tickets", "estimated_minutes", "per_user_limit", "is_active", "is_test", "starts_at", "ends_at", "sort_order", "created_at")


@router.get("/offers")
async def list_offers(_: StaffUser, db: DB):
    rows = (await db.execute(select(Offer).order_by(Offer.sort_order, Offer.id))).scalars()
    stats = {oid: (n, s) for oid, n, s in (await db.execute(
        select(Conversion.offer_id, func.count(), func.sum(Conversion.reward_tickets)).where(Conversion.status == "credited").group_by(Conversion.offer_id)
    )).all()}
    return {
        "providers": provider_names(),
        "items": [{**row_dict(o, *OFFER_FIELDS), "conversions": stats.get(o.id, (0, 0))[0], "tickets_paid": int(stats.get(o.id, (0, 0))[1] or 0)} for o in rows],
    }


def _offer_values(body: OfferIn) -> dict:
    if body.provider not in provider_names():
        raise AppError("unknown_provider", f"未登録の事業者です：{body.provider}")
    if "{click_id}" not in body.url_template:
        raise AppError("url_needs_click", "遷移先 URL には成果照合用の {click_id} を含めてください。")
    return {**body.model_dump(), "is_test": body.provider == "mock"}


@router.post("/offers", status_code=201)
async def create_offer(body: OfferIn, admin: AdminUser, request: Request, db: DB):
    o = Offer(**_offer_values(body))
    db.add(o)
    await db.flush()
    audit(db, admin, "offer.create", "offer", o.id, body.model_dump(mode="json"), request)
    await db.commit()
    await db.refresh(o)
    return row_dict(o, *OFFER_FIELDS)


@router.put("/offers/{offer_id}")
async def update_offer(offer_id: int, body: OfferIn, admin: AdminUser, request: Request, db: DB):
    o = await db.get(Offer, offer_id)
    if o is None:
        raise NotFound()
    for k, v in _offer_values(body).items():
        setattr(o, k, v)
    audit(db, admin, "offer.update", "offer", o.id, body.model_dump(mode="json"), request)
    await db.commit()
    await db.refresh(o)
    return row_dict(o, *OFFER_FIELDS)


@router.get("/conversions")
async def list_conversions(
    _: StaffUser, db: DB, status: str | None = None, provider: str | None = None, include_test: bool = True,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
):
    q = select(Conversion, Offer.title, User.email).outerjoin(Offer, Offer.id == Conversion.offer_id).outerjoin(User, User.id == Conversion.user_id)
    if status:
        q = q.where(Conversion.status == status)
    if provider:
        q = q.where(Conversion.provider == provider)
    if not include_test:
        q = q.where(Conversion.is_test.is_(False))
    rows, meta = await paged(db, q.order_by(Conversion.id.desc()), page, per_page, scalars=False)
    return {"items": [
        {**row_dict(c, "id", "provider", "external_conversion_id", "kind", "user_id", "offer_id", "status", "reject_reason",
                    "reward_tickets", "payout", "is_test", "duplicate_count", "received_at"), "offer_title": t, "email": e}
        for c, t, e in rows
    ], **meta}


@router.get("/postback-logs")
async def postback_logs(_: AdminUser, db: DB, outcome: str | None = None, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200)):
    q = select(PostbackLog)
    if outcome:
        q = q.where(PostbackLog.outcome == outcome)
    rows, meta = await paged(db, q.order_by(PostbackLog.id.desc()), page, per_page)
    return {"items": [row_dict(p, "id", "provider", "outcome", "detail", "ip", "params", "received_at") for p in rows], **meta}


# ── ミッション ─────────────────────────────────────────

MISSION_FIELDS = ("id", "code", "kind", "title", "description", "reward_tickets", "condition_type", "condition_value", "starts_at", "ends_at", "is_active")


@router.get("/missions")
async def list_missions(_: StaffUser, db: DB):
    rows = (await db.execute(select(Mission).order_by(Mission.id))).scalars()
    return {"items": [row_dict(m, *MISSION_FIELDS) for m in rows]}


@router.post("/missions", status_code=201)
async def create_mission(body: MissionIn, admin: AdminUser, request: Request, db: DB):
    if await db.scalar(select(Mission.id).where(Mission.code == body.code)):
        raise AppError("code_taken", "このコードは既に使われています。", 409)
    m = Mission(**body.model_dump())
    db.add(m)
    await db.flush()
    audit(db, admin, "mission.create", "mission", m.id, body.model_dump(mode="json"), request)
    await db.commit()
    return row_dict(m, *MISSION_FIELDS)


@router.put("/missions/{mission_id}")
async def update_mission(mission_id: int, body: MissionIn, admin: AdminUser, request: Request, db: DB):
    m = await db.get(Mission, mission_id)
    if m is None:
        raise NotFound()
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    audit(db, admin, "mission.update", "mission", m.id, body.model_dump(mode="json"), request)
    await db.commit()
    return row_dict(m, *MISSION_FIELDS)


# ── 景品交換申請 ─────────────────────────────────────────

EX_FIELDS = ("id", "user_id", "status", "recipient_masked", "carrier", "tracking_number", "admin_note", "user_message",
             "approved_at", "shipped_at", "completed_at", "pii_purged_at", "created_at", "updated_at")


@router.get("/exchanges")
async def list_exchanges(
    _: StaffUser, db: DB, status: str | None = None, user_id: int | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(30, ge=1, le=200),
):
    q = select(ExchangeRequest, User.email).join(User, User.id == ExchangeRequest.user_id)
    if status:
        q = q.where(ExchangeRequest.status == status)
    if user_id:
        q = q.where(ExchangeRequest.user_id == user_id)
    rows, meta = await paged(db, q.order_by(ExchangeRequest.id.desc()), page, per_page, scalars=False)
    counts = dict((await db.execute(
        select(ExchangeItem.request_id, func.count()).where(ExchangeItem.request_id.in_([r.id for r, _ in rows])).group_by(ExchangeItem.request_id)
    )).all()) if rows else {}
    by_status = dict((await db.execute(select(ExchangeRequest.status, func.count()).group_by(ExchangeRequest.status))).all())
    return {
        "items": [{**row_dict(r, *EX_FIELDS), "status_label": exchange_svc.STATUS_LABELS[r.status], "email": e, "item_count": counts.get(r.id, 0)} for r, e in rows],
        "by_status": by_status,
        **meta,
    }


@router.get("/exchanges/{req_id}")
async def exchange_detail(req_id: int, staff: StaffUser, request: Request, db: DB):
    from app.models import ExchangeStatusLog

    req = await exchange_svc.load_request(db, req_id)
    owner = await db.get(User, req.user_id)
    # 配送先（個人情報）の閲覧は監査ログに記録
    shipping = exchange_svc.load_shipping(req.shipping_encrypted)
    if shipping:
        audit(db, staff, "exchange.view_pii", "exchange", req.id, None, request)
        await db.commit()
    logs = (await db.execute(
        select(ExchangeStatusLog, User.email).outerjoin(User, User.id == ExchangeStatusLog.actor_id)
        .where(ExchangeStatusLog.request_id == req.id).order_by(ExchangeStatusLog.id)
    )).all()
    return {
        **row_dict(req, *EX_FIELDS),
        "status_label": exchange_svc.STATUS_LABELS[req.status],
        "email": owner.email if owner else None,
        "display_name": owner.display_name if owner else None,
        "shipping": shipping,
        "items": [
            {"user_prize_id": it.user_prize_id, "active": it.active, "status": it.user_prize.status,
             "prize": row_dict(it.user_prize.prize, "id", "name", "rarity", "image_url", "requires_shipping")}
            for it in req.items
        ],
        "allowed_transitions": sorted(s.value for s in EXCHANGE_TRANSITIONS[ExchangeStatus(req.status)]),
        "history": [
            {**row_dict(log, "from_status", "to_status", "note", "created_at"), "actor_email": e} for log, e in logs
        ],
    }


@router.post("/exchanges/{req_id}/status")
async def exchange_transition(req_id: int, body: ExchangeTransitionIn, staff: StaffUser, request: Request, db: DB):
    # 追跡番号は任意（追跡番号のない配送方法もあるため）
    req = await exchange_svc.transition(
        db, staff, req_id, ExchangeStatus(body.status), body.note, body.carrier, body.tracking_number
    )
    audit(db, staff, "exchange.status", "exchange", req.id, {"to": body.status, "note": body.note}, request)
    await db.commit()
    return await exchange_detail(req_id, staff, request, db)


@router.post("/exchanges/purge-pii")
async def purge_pii(admin: AdminUser, request: Request, db: DB):
    n = await exchange_svc.purge_expired_pii(db)
    audit(db, admin, "exchange.purge_pii", "exchange", None, {"count": n}, request)
    await db.commit()
    return {"purged": n}


@router.get("/inventory")
async def inventory(_: StaffUser, db: DB):
    """全ガチャの在庫一覧（在庫管理画面用）。"""
    rows = (await db.execute(
        select(GachaItem, Gacha, Prize).join(Gacha, Gacha.id == GachaItem.gacha_id).join(Prize, Prize.id == GachaItem.prize_id)
        .where(Gacha.status != GachaStatus.archived).order_by(Gacha.sort_order, Gacha.id, GachaItem.sort_order)
    )).all()
    owned = dict((await db.execute(select(UserPrize.prize_id, func.count()).group_by(UserPrize.prize_id))).all())
    return {"items": [
        {"gacha_id": g.id, "gacha_title": g.title, "gacha_status": g.status, "mode": g.mode, "item_id": i.id,
         "prize_id": p.id, "prize_name": p.name, "rarity": p.rarity, "weight": i.weight, "stock_total": i.stock_total,
         "stock_remaining": i.stock_remaining, "is_active": i.is_active, "awarded_total": owned.get(p.id, 0)}
        for i, g, p in rows
    ]}


# ── キャンペーンバナー ───────────────────────────────────

BANNER_FIELDS = ("id", "tag", "tag_color", "title", "subtitle", "image_url", "link", "starts_at", "ends_at", "sort_order", "is_active")


@router.get("/banners")
async def list_banners(_: StaffUser, db: DB):
    rows = (await db.execute(select(Banner).order_by(Banner.sort_order, Banner.id))).scalars()
    return {"items": [row_dict(b, *BANNER_FIELDS) for b in rows]}


@router.post("/banners", status_code=201)
async def create_banner(body: BannerIn, admin: AdminUser, request: Request, db: DB):
    b = Banner(**body.model_dump())
    db.add(b)
    await db.flush()
    audit(db, admin, "banner.create", "banner", b.id, body.model_dump(mode="json"), request)
    await db.commit()
    return row_dict(b, *BANNER_FIELDS)


@router.put("/banners/{banner_id}")
async def update_banner(banner_id: int, body: BannerIn, admin: AdminUser, request: Request, db: DB):
    b = await db.get(Banner, banner_id)
    if b is None:
        raise NotFound()
    for k, v in body.model_dump().items():
        setattr(b, k, v)
    audit(db, admin, "banner.update", "banner", b.id, body.model_dump(mode="json"), request)
    await db.commit()
    return row_dict(b, *BANNER_FIELDS)


@router.delete("/banners/{banner_id}")
async def delete_banner(banner_id: int, admin: AdminUser, request: Request, db: DB):
    b = await db.get(Banner, banner_id)
    if b is None:
        raise NotFound()
    await db.delete(b)
    audit(db, admin, "banner.delete", "banner", banner_id, {"title": b.title}, request)
    await db.commit()
    return {"ok": True}


@router.get("/newsletter")
async def list_newsletter(_: StaffUser, db: DB, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500)):
    q = select(NewsletterSubscription).where(NewsletterSubscription.unsubscribed_at.is_(None)).order_by(NewsletterSubscription.id.desc())
    rows, meta = await paged(db, q, page, per_page)
    return {"items": [row_dict(n, "id", "email", "user_id", "created_at") for n in rows], **meta}
