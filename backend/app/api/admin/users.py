"""管理 API：ダッシュボード・ユーザー・チケット・操作履歴・設定・お知らせ・お問い合わせ。"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Query, Request
from sqlalchemy import String, cast, func, or_, select

from app.api.admin.common import JST, jst_start, paged, row_dict
from app.api.admin.schemas import (
    AnnouncementIn,
    ContactStatusIn,
    MessageIn,
    PointAdjustIn,
    RoleIn,
    SuspendIn,
    TicketAdjustIn,
)
from app.api.deps import DB, AdminUser, StaffUser
from app.core.errors import AppError, NotFound
from app.core.netkey import net_expr
from app.models import (
    AdminAuditLog,
    AdminMessage,
    Announcement,
    ContactMessage,
    Conversion,
    Draw,
    ExchangeRequest,
    Gacha,
    Notification,
    OfferClick,
    PointTransaction,
    PointWallet,
    Prize,
    ShopOrder,
    TicketTransaction,
    TicketWallet,
    User,
    UserPrize,
    UserSession,
)
from app.models.enums import ExchangeStatus, PointKind, Role, TicketKind, UserStatus
from app.services import auth as auth_svc
from app.services import messages as message_svc
from app.services import points, settings_store, tickets
from app.services.audit import audit

router = APIRouter()

USER_FIELDS = ("id", "email", "display_name", "role", "status", "email_verified_at", "last_login_at", "created_at", "suspended_reason", "phone_verified_at", "phone_last4", "invite_code", "referred_by_id")
TX_FIELDS = ("id", "user_id", "delta", "balance_after", "kind", "description", "ref_type", "ref_id", "actor_id", "is_test", "created_at")


# ── ダッシュボード ───────────────────────────────────────


@router.get("/stats")
async def stats(_: StaffUser, db: DB, days: int = Query(14, ge=1, le=90)):
    today = datetime.now(JST).date()
    start_today = jst_start(today)
    since = jst_start(today - timedelta(days=days - 1))

    async def count(model, *where):
        return await db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    issued_today = await db.scalar(
        select(func.coalesce(func.sum(TicketTransaction.delta), 0)).where(
            TicketTransaction.delta > 0, TicketTransaction.created_at >= start_today, TicketTransaction.is_test.is_(False)
        )
    )
    spent_today = await db.scalar(
        select(func.coalesce(func.sum(-TicketTransaction.delta), 0)).where(
            TicketTransaction.delta < 0, TicketTransaction.created_at >= start_today
        )
    )
    day = func.date(func.timezone("Asia/Tokyo", Draw.created_at))
    draw_series = {
        str(d): {"draws": int(n or 0), "pulls": int(p or 0)}
        for d, n, p in (await db.execute(
            select(day, func.count(), func.sum(Draw.count)).where(Draw.created_at >= since).group_by(day)
        )).all()
    }
    uday = func.date(func.timezone("Asia/Tokyo", User.created_at))
    signup_series = {
        str(d): int(n) for d, n in (await db.execute(
            select(uday, func.count()).where(User.created_at >= since).group_by(uday)
        )).all()
    }
    tday = func.date(func.timezone("Asia/Tokyo", TicketTransaction.created_at))
    ticket_rows = (await db.execute(
        select(
            tday,
            func.sum(func.greatest(TicketTransaction.delta, 0)),
            func.sum(func.greatest(-TicketTransaction.delta, 0)),
        ).where(TicketTransaction.created_at >= since, TicketTransaction.is_test.is_(False)).group_by(tday)
    )).all()
    ticket_series = {str(d): {"issued": int(i or 0), "spent": int(s or 0)} for d, i, s in ticket_rows}
    series = []
    for k in range(days):
        d = str(today - timedelta(days=days - 1 - k))
        series.append({
            "date": d,
            "signups": signup_series.get(d, 0),
            "draws": draw_series.get(d, {}).get("draws", 0),
            "pulls": draw_series.get(d, {}).get("pulls", 0),
            "tickets_issued": ticket_series.get(d, {}).get("issued", 0),
            "tickets_spent": ticket_series.get(d, {}).get("spent", 0),
        })
    rarity_rows = (await db.execute(
        select(Prize.rarity, func.count()).join(UserPrize, UserPrize.prize_id == Prize.id)
        .where(UserPrize.acquired_at >= since).group_by(Prize.rarity)
    )).all()
    return {
        "users_total": await count(User),
        "users_today": await count(User, User.created_at >= start_today),
        "users_suspended": await count(User, User.status == UserStatus.suspended),
        "draws_today": await count(Draw, Draw.created_at >= start_today),
        "pulls_today": int(await db.scalar(select(func.coalesce(func.sum(Draw.count), 0)).where(Draw.created_at >= start_today)) or 0),
        "tickets_issued_today": int(issued_today or 0),
        "tickets_spent_today": int(spent_today or 0),
        "tickets_outstanding": int(await db.scalar(select(func.coalesce(func.sum(TicketWallet.balance), 0))) or 0),
        "points_outstanding": int(await db.scalar(select(func.coalesce(func.sum(PointWallet.balance), 0))) or 0),
        "shop_orders_pending": await count(ShopOrder, ShopOrder.status == "pending"),
        "exchanges_pending": await count(ExchangeRequest, ExchangeRequest.status == ExchangeStatus.pending),
        "exchanges_in_progress": await count(ExchangeRequest, ExchangeRequest.status.in_([ExchangeStatus.approved, ExchangeStatus.preparing])),
        "conversions_today": await count(Conversion, Conversion.received_at >= start_today, Conversion.is_test.is_(False)),
        "contacts_open": await count(ContactMessage, ContactMessage.status == "open"),
        "gachas_live": await count(Gacha, Gacha.status == "published"),
        "rarity_distribution": {r: int(n) for r, n in rarity_rows},
        "series": series,
    }


# ── ユーザー ───────────────────────────────────────────


@router.get("/users")
async def list_users(
    _: StaffUser, db: DB,
    q: str | None = None,
    status: Literal["active", "suspended"] | None = None,
    role: Literal["user", "staff", "admin"] | None = None,
    verified: bool | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(30, ge=1, le=200),
):
    stmt = (
        select(User, TicketWallet.balance, PointWallet.balance)
        .outerjoin(TicketWallet, TicketWallet.user_id == User.id)
        .outerjoin(PointWallet, PointWallet.user_id == User.id)
    )
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.display_name.ilike(like), cast(User.id, String) == q.strip()))
    if status:
        stmt = stmt.where(User.status == status)
    if role:
        stmt = stmt.where(User.role == role)
    if verified is not None:
        stmt = stmt.where(User.email_verified_at.is_not(None) if verified else User.email_verified_at.is_(None))
    rows, meta = await paged(db, stmt.order_by(User.id.desc()), page, per_page, scalars=False)
    return {"items": [{**row_dict(u, *USER_FIELDS), "balance": b or 0, "point_balance": pb or 0} for u, b, pb in rows], **meta}


async def _user(db, user_id: int) -> User:
    u = await db.get(User, user_id)
    if u is None:
        raise NotFound("ユーザーが見つかりません。")
    return u


@router.get("/users/{user_id}")
async def user_detail(user_id: int, _: StaffUser, db: DB):
    u = await _user(db, user_id)
    w = await db.get(TicketWallet, u.id)
    pw = await db.get(PointWallet, u.id)
    ptxs = (await db.execute(
        select(PointTransaction).where(PointTransaction.user_id == u.id).order_by(PointTransaction.id.desc()).limit(20)
    )).scalars()
    draws = (await db.execute(
        select(Draw, Gacha.title).join(Gacha, Gacha.id == Draw.gacha_id).where(Draw.user_id == u.id).order_by(Draw.created_at.desc()).limit(20)
    )).all()
    prize_counts = (await db.execute(
        select(UserPrize.status, func.count()).where(UserPrize.user_id == u.id).group_by(UserPrize.status)
    )).all()
    txs = (await db.execute(
        select(TicketTransaction).where(TicketTransaction.user_id == u.id).order_by(TicketTransaction.id.desc()).limit(20)
    )).scalars()
    return {
        **row_dict(u, *USER_FIELDS, "failed_login_count", "locked_until", "signup_ip"),
        "wallet": {"balance": w.balance, "total_earned": w.total_earned, "total_spent": w.total_spent} if w else None,
        "point_wallet": {"balance": pw.balance, "total_earned": pw.total_earned, "total_spent": pw.total_spent} if pw else None,
        "recent_point_transactions": [row_dict(t, *TX_FIELDS) for t in ptxs],
        "recent_draws": [
            {"id": str(d.id), "gacha_title": t, "count": d.count, "tickets_spent": d.tickets_spent,
             "best_rarity": d.best_rarity, "has_last_one": d.has_last_one, "created_at": d.created_at}
            for d, t in draws
        ],
        "prize_counts": {s: n for s, n in prize_counts},
        "recent_transactions": [row_dict(t, *TX_FIELDS) for t in txs],
        "exchanges": await db.scalar(select(func.count()).select_from(ExchangeRequest).where(ExchangeRequest.user_id == u.id)),
    }


def _ip_rows(since: datetime):
    """会員と IP アドレスの組（登録時・ログイン・広告のクリック）。net は同じネットワークの単位（IPv6 は /64）。"""
    base = (
        select(User.id.label("user_id"), User.signup_ip.label("ip"), User.created_at.label("at")).where(User.signup_ip.is_not(None))
        .union_all(
            select(UserSession.user_id, UserSession.ip, UserSession.created_at).where(UserSession.ip.is_not(None), UserSession.created_at >= since),
            select(OfferClick.user_id, OfferClick.ip, OfferClick.created_at).where(OfferClick.ip.is_not(None), OfferClick.created_at >= since),
        )
        .subquery()
    )
    return select(base.c.user_id, base.c.ip, base.c.at, net_expr(base.c.ip).label("net")).subquery()


@router.get("/users/{user_id}/same-ip")
async def same_ip_users(user_id: int, staff: StaffUser, request: Request, db: DB, days: int = Query(30, ge=1, le=365)):
    """複数アカウントの確認：この会員と同じネットワーク（IPv4 は同じアドレス、IPv6 は同じ /64）を使った会員
    （登録・ログイン・広告のクリック、直近 days 日）。
    スマートフォンの回線や家族・お店の Wi-Fi では、別の人でも同じ IP になることがあるため、停止の前に内容を確認すること。"""
    u = await _user(db, user_id)
    rows = _ip_rows(datetime.now(UTC) - timedelta(days=days))
    mine = select(rows.c.net).where(rows.c.user_id == u.id).distinct().scalar_subquery()
    found = (await db.execute(
        select(rows.c.user_id, rows.c.ip, func.max(rows.c.at))
        .where(rows.c.net.in_(mine), rows.c.user_id != u.id)
        .group_by(rows.c.user_id, rows.c.ip)
    )).all()
    my_ips = sorted({ip for (ip,) in (await db.execute(select(rows.c.ip).where(rows.c.user_id == u.id).distinct())).all()})
    by_user: dict[int, dict] = {}
    for uid, ip, at in found:
        e = by_user.setdefault(uid, {"ips": set(), "last_at": at})
        e["ips"].add(ip)
        e["last_at"] = max(e["last_at"], at)
    users = {x.id: x for x in (await db.execute(select(User).where(User.id.in_(list(by_user))))).scalars()} if by_user else {}
    items = [
        {**row_dict(users[uid], "id", "email", "display_name", "status", "created_at", "phone_verified_at"),
         "shared_ips": sorted(e["ips"]), "last_seen_at": e["last_at"]}
        for uid, e in sorted(by_user.items(), key=lambda kv: kv[1]["last_at"], reverse=True)
        if uid in users
    ][:100]
    # IP アドレス（個人情報）の閲覧は操作履歴に記録する
    audit(db, staff, "user.view_same_ip", "user", u.id, {"days": days, "matches": len(items)}, request)
    await db.commit()
    return {"user_id": u.id, "days": days, "ips": my_ips, "items": items}


@router.post("/users/{user_id}/suspend")
async def suspend(user_id: int, body: SuspendIn, admin: AdminUser, request: Request, db: DB):
    u = await _user(db, user_id)
    if u.id == admin.id:
        raise AppError("self_suspend", "自分自身を停止することはできません。")
    u.status = UserStatus.suspended
    u.suspended_reason = body.reason
    await auth_svc.revoke_all_sessions(db, u.id)
    audit(db, admin, "user.suspend", "user", u.id, {"reason": body.reason}, request)
    await db.commit()
    return row_dict(u, *USER_FIELDS)


@router.post("/users/{user_id}/unsuspend")
async def unsuspend(user_id: int, admin: AdminUser, request: Request, db: DB):
    u = await _user(db, user_id)
    u.status = UserStatus.active
    u.suspended_reason = None
    u.locked_until = None
    u.failed_login_count = 0
    audit(db, admin, "user.unsuspend", "user", u.id, None, request)
    await db.commit()
    return row_dict(u, *USER_FIELDS)


@router.post("/users/{user_id}/role")
async def set_role(user_id: int, body: RoleIn, admin: AdminUser, request: Request, db: DB):
    u = await _user(db, user_id)
    if u.id == admin.id and body.role != Role.admin:
        raise AppError("self_demote", "自分自身の管理者権限は解除できません。")
    old = u.role
    u.role = body.role
    await auth_svc.revoke_all_sessions(db, u.id)  # 権限変更時は再ログインさせる
    audit(db, admin, "user.role", "user", u.id, {"from": old, "to": body.role}, request)
    await db.commit()
    return row_dict(u, *USER_FIELDS)


@router.post("/users/{user_id}/tickets")
async def adjust_tickets(user_id: int, body: TicketAdjustIn, admin: AdminUser, request: Request, db: DB):
    u = await _user(db, user_id)
    kind = TicketKind.admin_grant if body.delta > 0 else TicketKind.admin_adjust
    tx = await tickets.adjust(
        db, u.id, body.delta, kind, f"運営より：{body.reason}", actor_id=admin.id,
        dedupe_key=f"admin:{admin.id}:{body.idempotency_key}",
    )
    if tx is None:
        return {"duplicate": True, "balance": await tickets.get_balance(db, u.id)}
    if body.delta > 0:
        db.add(Notification(user_id=u.id, kind="grant", title="チケットが付与されました", body=f"運営よりチケット{body.delta}枚が付与されました。（{body.reason}）", link="/tickets"))
    audit(db, admin, "tickets.adjust", "user", u.id, {"delta": body.delta, "reason": body.reason, "tx_id": tx.id}, request)
    await db.commit()
    return {"duplicate": False, "balance": tx.balance_after, "transaction": row_dict(tx, *TX_FIELDS)}


@router.post("/users/{user_id}/points")
async def adjust_points(user_id: int, body: PointAdjustIn, admin: AdminUser, request: Request, db: DB):
    """ポイント（交換用の残高）の付与・減算。チケットとは別。"""
    u = await _user(db, user_id)
    kind = PointKind.admin_grant if body.delta > 0 else PointKind.admin_adjust
    tx = await points.adjust(
        db, u.id, body.delta, kind, f"運営より：{body.reason}", actor_id=admin.id,
        dedupe_key=f"admin-pt:{admin.id}:{body.idempotency_key}",
    )
    if tx is None:
        return {"duplicate": True, "balance": await points.get_balance(db, u.id)}
    if body.delta > 0:
        db.add(Notification(user_id=u.id, kind="grant", title="ポイントが付与されました", body=f"運営より{body.delta:,}ptが付与されました。（{body.reason}）", link="/points"))
    audit(db, admin, "points.adjust", "user", u.id, {"delta": body.delta, "reason": body.reason, "tx_id": tx.id}, request)
    await db.commit()
    return {"duplicate": False, "balance": tx.balance_after, "transaction": row_dict(tx, *TX_FIELDS)}


@router.get("/tickets/transactions")
async def all_transactions(
    _: StaffUser, db: DB,
    user_id: int | None = None,
    kind: str | None = None,
    direction: Literal["all", "earn", "spend"] = "all",
    include_test: bool = True,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
):
    q = select(TicketTransaction, User.email).join(User, User.id == TicketTransaction.user_id)
    if user_id:
        q = q.where(TicketTransaction.user_id == user_id)
    if kind:
        q = q.where(TicketTransaction.kind == kind)
    if direction == "earn":
        q = q.where(TicketTransaction.delta > 0)
    elif direction == "spend":
        q = q.where(TicketTransaction.delta < 0)
    if not include_test:
        q = q.where(TicketTransaction.is_test.is_(False))
    rows, meta = await paged(db, q.order_by(TicketTransaction.id.desc()), page, per_page, scalars=False)
    return {"items": [{**row_dict(t, *TX_FIELDS), "email": e} for t, e in rows], **meta}


@router.get("/tickets/summary")
async def tickets_summary(_: StaffUser, db: DB):
    rows = (await db.execute(
        select(TicketTransaction.kind, func.count(), func.sum(TicketTransaction.delta))
        .where(TicketTransaction.is_test.is_(False)).group_by(TicketTransaction.kind)
    )).all()
    return {"by_kind": [{"kind": k, "count": c, "sum": int(s or 0)} for k, c, s in rows]}


# ── 操作履歴 ───────────────────────────────────────────


@router.get("/audit-logs")
async def audit_logs(
    _: AdminUser, db: DB, action: str | None = None, actor_id: int | None = None,
    target_type: str | None = None, target_id: str | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
):
    q = select(AdminAuditLog, User.email).outerjoin(User, User.id == AdminAuditLog.actor_id)
    if action:
        q = q.where(AdminAuditLog.action.like(f"{action}%"))
    if actor_id:
        q = q.where(AdminAuditLog.actor_id == actor_id)
    if target_type:
        q = q.where(AdminAuditLog.target_type == target_type)
    if target_id:
        q = q.where(AdminAuditLog.target_id == target_id)
    rows, meta = await paged(db, q.order_by(AdminAuditLog.id.desc()), page, per_page, scalars=False)
    return {
        "items": [
            {**row_dict(a, "id", "actor_id", "action", "target_type", "target_id", "detail", "ip", "created_at"), "actor_email": e}
            for a, e in rows
        ],
        **meta,
    }


# ── システム設定 ─────────────────────────────────────────


@router.get("/settings")
async def get_settings(_: StaffUser, db: DB):
    values = await settings_store.get_all(db)
    return {"values": values, "descriptions": settings_store.DESCRIPTIONS}


@router.put("/settings")
async def put_settings(body: dict, admin: AdminUser, request: Request, db: DB):
    before = await settings_store.get_all(db)
    try:
        await settings_store.set_many(db, body, admin.id)
    except ValueError as e:
        raise AppError("invalid_setting", f"設定値が正しくありません：{e}") from e
    changed = {k: {"from": before.get(k), "to": v} for k, v in body.items() if k in before and before[k] != v}
    audit(db, admin, "settings.update", "settings", None, changed, request)
    await db.commit()
    return {"values": await settings_store.get_all(db)}


# ── 全体お知らせ ─────────────────────────────────────────

ANN_FIELDS = ("id", "title", "body", "category", "is_published", "published_at", "created_at", "updated_at")


@router.get("/announcements")
async def list_announcements(_: StaffUser, db: DB, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200)):
    rows, meta = await paged(db, select(Announcement).order_by(Announcement.id.desc()), page, per_page)
    return {"items": [row_dict(a, *ANN_FIELDS) for a in rows], **meta}


@router.post("/announcements", status_code=201)
async def create_announcement(body: AnnouncementIn, staff: StaffUser, request: Request, db: DB):
    a = Announcement(**body.model_dump())
    if a.is_published and not a.published_at:
        a.published_at = datetime.now(UTC)
    db.add(a)
    await db.flush()
    audit(db, staff, "announcement.create", "announcement", a.id, {"title": a.title}, request)
    await db.commit()
    return row_dict(a, *ANN_FIELDS)


@router.put("/announcements/{ann_id}")
async def update_announcement(ann_id: int, body: AnnouncementIn, staff: StaffUser, request: Request, db: DB):
    a = await db.get(Announcement, ann_id)
    if a is None:
        raise NotFound()
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    if a.is_published and not a.published_at:
        a.published_at = datetime.now(UTC)
    audit(db, staff, "announcement.update", "announcement", a.id, {"title": a.title}, request)
    await db.commit()
    await db.refresh(a)
    return row_dict(a, *ANN_FIELDS)


@router.delete("/announcements/{ann_id}")
async def delete_announcement(ann_id: int, staff: StaffUser, request: Request, db: DB):
    a = await db.get(Announcement, ann_id)
    if a is None:
        raise NotFound()
    await db.delete(a)
    audit(db, staff, "announcement.delete", "announcement", ann_id, {"title": a.title}, request)
    await db.commit()
    return {"ok": True}


# ── お問い合わせ ─────────────────────────────────────────


@router.get("/contacts")
async def list_contacts(
    _: StaffUser, db: DB, status: Literal["open", "in_progress", "closed"] | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(30, ge=1, le=200),
):
    q = select(ContactMessage)
    if status:
        q = q.where(ContactMessage.status == status)
    rows, meta = await paged(db, q.order_by(ContactMessage.id.desc()), page, per_page)
    return {"items": [row_dict(c, "id", "user_id", "name", "email", "category", "body", "status", "created_at") for c in rows], **meta}


@router.post("/contacts/{cid}/status")
async def contact_status(cid: int, body: ContactStatusIn, staff: StaffUser, request: Request, db: DB):
    c = await db.get(ContactMessage, cid)
    if c is None:
        raise NotFound()
    c.status = body.status
    audit(db, staff, "contact.status", "contact", cid, {"status": body.status}, request)
    await db.commit()
    return {"ok": True}


# ── 会員へのメッセージ配信 ───────────────────────────────


def _check_message_permission(actor: User, target_type: str, user_ids: list[int]) -> None:
    # スタッフは個別の会員への連絡のみ。全体配信は管理者のみ
    if actor.role != Role.admin and (target_type != "users" or len(user_ids) > 50):
        raise AppError("forbidden", "全会員への一斉配信は管理者のみ実行できます。", 403)


@router.get("/messages/recipients")
async def message_recipients(
    staff: StaffUser, db: DB,
    target_type: Literal["users", "all", "verified"] = "all",
    user_ids: str = "",
):
    ids = [int(x) for x in user_ids.split(",") if x.strip().isdigit()]
    if target_type == "users" and not ids:
        return {"count": 0, "email_count": 0}
    count, email_count = await message_svc.count_recipients(db, target_type, ids)
    return {"count": count, "email_count": email_count}


@router.post("/messages", status_code=201)
async def send_message(body: MessageIn, staff: StaffUser, request: Request, background: BackgroundTasks, db: DB):
    ids = sorted(set(body.user_ids))
    _check_message_permission(staff, body.target_type, ids)
    msg, emails = await message_svc.send(
        db, staff, body.target_type, ids, body.title.strip(), body.body.strip(), body.link, body.send_email
    )
    audit(db, staff, "message.send", "message", msg.id,
          {"target": body.target_type, "user_ids": ids[:50], "title": msg.title, "recipients": msg.recipient_count,
           "emails": msg.email_count}, request)
    await db.commit()
    if emails:
        background.add_task(message_svc.deliver_emails, emails, msg.title, msg.body, msg.link)
    return {"id": msg.id, "recipient_count": msg.recipient_count, "email_count": msg.email_count}


@router.get("/messages")
async def list_messages(_: StaffUser, db: DB, page: int = Query(1, ge=1), per_page: int = Query(30, ge=1, le=200)):
    q = select(AdminMessage, User.email).outerjoin(User, User.id == AdminMessage.sender_id)
    rows, meta = await paged(db, q.order_by(AdminMessage.id.desc()), page, per_page, scalars=False)
    return {
        "items": [
            {**row_dict(m, "id", "target_type", "target_user_ids", "title", "body", "link", "send_email",
                        "recipient_count", "email_count", "created_at"),
             "target_label": message_svc.TARGET_LABELS.get(m.target_type, m.target_type), "sender_email": e}
            for m, e in rows
        ],
        **meta,
    }


@router.post("/users/{user_id}/resend-verification")
async def admin_resend_verification(user_id: int, staff: StaffUser, request: Request, db: DB):
    """確認メールを再送する（会員から「メールが届かない」と問い合わせがあった場合）。"""
    u = await _user(db, user_id)
    if u.email_verified_at is not None:
        raise AppError("already_verified", "このメールアドレスは確認済みです。")
    await auth_svc.resend_verification(db, u)
    audit(db, staff, "user.resend_verification", "user", u.id, None, request)
    await db.commit()
    return {"message": "確認メールを再送しました。"}


@router.post("/users/{user_id}/verify-email")
async def admin_verify_email(user_id: int, admin: AdminUser, request: Request, db: DB):
    """メールアドレスを手動で確認済みにする（本人確認ができた場合のみ）。新規登録特典も通常どおり付与する。"""
    u = await _user(db, user_id)
    if not await auth_svc.complete_email_verification(db, u):
        raise AppError("already_verified", "このメールアドレスは確認済みです。")
    audit(db, admin, "user.verify_email", "user", u.id, None, request)
    await db.commit()
    return row_dict(u, *USER_FIELDS)
