"""管理：ポイント交換の景品・ギフトコード在庫・交換申請。"""

import uuid
from typing import Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.admin.common import paged, row_dict
from app.api.deps import DB, AdminUser, StaffUser
from app.core.errors import AppError, NotFound
from app.models import GiftCode, ShopItem, ShopOrder, User
from app.services import shop
from app.services.audit import audit

router = APIRouter()

ITEM_FIELDS = ("id", "name", "brand", "description", "image_url", "kind", "point_cost", "face_value_yen", "stock_total",
               "stock_remaining", "per_user_limit", "is_active", "sort_order", "created_at", "updated_at")


class ShopItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    brand: str = Field(default="", max_length=40)
    description: str = Field(default="", max_length=2000)
    image_url: str | None = Field(default=None, max_length=500)
    kind: Literal["digital_code", "shipping"]
    point_cost: int = Field(ge=1, le=100_000_000)
    face_value_yen: int | None = Field(default=None, ge=0, le=10_000_000)
    stock_total: int | None = Field(default=None, ge=0, le=10_000_000)  # null は無制限
    per_user_limit: int | None = Field(default=None, ge=1, le=10_000)
    is_active: bool = True
    sort_order: int = 0


@router.get("/shop/items")
async def list_items(_: StaffUser, db: DB):
    items = (await db.execute(select(ShopItem).order_by(ShopItem.sort_order, ShopItem.id))).scalars().all()
    codes = await shop.available_codes(db, [i.id for i in items])
    pending = dict((await db.execute(
        select(ShopOrder.item_id, func.count()).where(ShopOrder.status == "pending").group_by(ShopOrder.item_id)
    )).all())
    return {"items": [{**row_dict(i, *ITEM_FIELDS), "codes_available": codes.get(i.id, 0), "orders_pending": pending.get(i.id, 0)} for i in items]}


@router.post("/shop/items")
async def create_item(body: ShopItemIn, admin: AdminUser, request: Request, db: DB):
    item = ShopItem(**body.model_dump(), stock_remaining=body.stock_total)
    db.add(item)
    await db.flush()
    audit(db, admin, "shop_item.create", "shop_item", item.id, body.model_dump(), request)
    await db.commit()
    return row_dict(item, *ITEM_FIELDS)


@router.put("/shop/items/{item_id}")
async def update_item(item_id: int, body: ShopItemIn, admin: AdminUser, request: Request, db: DB):
    item = (await db.execute(select(ShopItem).where(ShopItem.id == item_id).with_for_update())).scalar_one_or_none()
    if item is None:
        raise NotFound("景品が見つかりません。")
    if item.kind != body.kind and await db.scalar(select(func.count()).select_from(ShopOrder).where(ShopOrder.item_id == item.id)):
        raise AppError("kind_locked", "交換申請がある景品は、種類（デジタルギフト／発送）を変更できません。")
    data = body.model_dump()
    # 在庫数の変更：交換済みの数を保ったまま残り在庫を合わせる
    if body.stock_total is None:
        item.stock_remaining = None
    else:
        used = (item.stock_total - item.stock_remaining) if (item.stock_total is not None and item.stock_remaining is not None) else (
            await db.scalar(select(func.count()).select_from(ShopOrder).where(ShopOrder.item_id == item.id, ShopOrder.status != "cancelled")) or 0
        )
        if body.stock_total < used:
            raise AppError("stock_too_small", f"在庫数は交換済みの数（{used}）以上にしてください。")
        item.stock_remaining = body.stock_total - used
    for k, v in data.items():
        setattr(item, k, v)
    audit(db, admin, "shop_item.update", "shop_item", item.id, data, request)
    await db.commit()
    return row_dict(item, *ITEM_FIELDS)


@router.delete("/shop/items/{item_id}")
async def delete_item(item_id: int, admin: AdminUser, request: Request, db: DB):
    item = await db.get(ShopItem, item_id)
    if item is None:
        raise NotFound("景品が見つかりません。")
    if await db.scalar(select(func.count()).select_from(ShopOrder).where(ShopOrder.item_id == item.id)):
        # 履歴を残すため削除せず非公開にする
        item.is_active = False
        audit(db, admin, "shop_item.deactivate", "shop_item", item.id, None, request)
        await db.commit()
        return {"deleted": False, "deactivated": True}
    await db.delete(item)
    audit(db, admin, "shop_item.delete", "shop_item", item_id, None, request)
    await db.commit()
    return {"deleted": True}


class CodesIn(BaseModel):
    codes: str = Field(min_length=1, max_length=200_000)  # 1 行に 1 コード
    expires_on: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


@router.post("/shop/items/{item_id}/codes")
async def upload_codes(item_id: int, body: CodesIn, admin: AdminUser, request: Request, db: DB):
    lines = body.codes.splitlines()
    if len(lines) > 5000:
        raise AppError("too_many_codes", "一度に登録できるのは 5,000 件までです。")
    result = await shop.add_codes(db, item_id, lines, body.expires_on, admin)
    audit(db, admin, "gift_codes.upload", "shop_item", item_id, result, request)  # コード自体は記録しない
    await db.commit()
    return result


@router.get("/shop/items/{item_id}/codes")
async def code_summary(item_id: int, _: AdminUser, db: DB):
    """コードの中身は返さない（件数と有効期限のみ）。"""
    rows = (await db.execute(
        select(GiftCode.expires_on, shop.code_is_available(), func.count()).where(GiftCode.item_id == item_id)
        .group_by(GiftCode.expires_on, shop.code_is_available())
    )).all()
    return {"groups": [{"expires_on": e, "available": bool(a), "count": n} for e, a, n in rows]}


@router.get("/shop/orders")
async def list_orders(
    _: StaffUser, db: DB,
    status: Literal["pending", "fulfilled", "shipped", "cancelled"] | None = None,
    kind: Literal["digital_code", "shipping"] | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(30, ge=1, le=200),
):
    q = select(ShopOrder, User.email, User.display_name).join(User, User.id == ShopOrder.user_id)
    if status:
        q = q.where(ShopOrder.status == status)
    if kind:
        q = q.where(ShopOrder.kind == kind)
    rows, meta = await paged(db, q.order_by(ShopOrder.created_at.desc()), page, per_page, scalars=False)
    return {"items": [
        {"id": str(o.id), "user_id": o.user_id, "email": email, "display_name": name, "item_name": o.item_name, "kind": o.kind,
         "point_cost": o.point_cost, "status": o.status, "status_label": shop.STATUS_LABELS[o.status],
         "recipient_masked": o.recipient_masked, "created_at": o.created_at, "fulfilled_at": o.fulfilled_at}
        for o, email, name in rows
    ], **meta}


@router.get("/shop/orders/{order_id}")
async def order_detail(order_id: uuid.UUID, staff: StaffUser, request: Request, db: DB):
    o = await shop.load_order(db, order_id)
    u = await db.get(User, o.user_id)
    ship = shop.shipping_of(o)
    if ship:
        audit(db, staff, "shop_order.view_shipping", "shop_order", str(o.id), None, request)
        await db.commit()
    # お渡し済みのギフトコードは運営画面でも表示しない（伏せ字）
    out = shop.order_out(o, reveal_code=False)
    out["gift_code_assigned"] = o.gift_code is not None
    return {**out, "user": {"id": u.id, "email": u.email, "display_name": u.display_name} if u else None, "shipping": ship}


class OrderTransitionIn(BaseModel):
    to: Literal["fulfilled", "shipped", "cancelled"]
    code: str | None = Field(default=None, max_length=200)
    expires_on: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    carrier: str | None = Field(default=None, max_length=40)
    tracking_number: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=500)


@router.post("/shop/orders/{order_id}/transition")
async def transition(order_id: uuid.UUID, body: OrderTransitionIn, staff: StaffUser, request: Request, db: DB):
    o = await shop.admin_transition(
        db, order_id, body.to, staff, code=body.code, expires_on=body.expires_on,
        carrier=body.carrier, tracking_number=body.tracking_number, note=body.note,
    )
    audit(db, staff, f"shop_order.{body.to}", "shop_order", str(order_id),
          {"carrier": body.carrier, "tracking_number": body.tracking_number, "note": body.note}, request)
    await db.commit()
    return shop.order_out(o, reveal_code=False)


@router.get("/referrals")
async def referral_overview(_: StaffUser, db: DB, page: int = Query(1, ge=1), per_page: int = Query(30, ge=1, le=200)):
    """紹介した人数の多い順（不正な大量紹介の確認用）。"""
    inviter = User.__table__.alias("inviter")
    q = (
        select(inviter.c.id, inviter.c.email, inviter.c.display_name, func.count(User.id), func.count(User.referral_rewarded_at),
               func.max(User.created_at))
        .join(User, User.referred_by_id == inviter.c.id)
        .group_by(inviter.c.id, inviter.c.email, inviter.c.display_name)
        .order_by(func.count(User.id).desc())
    )
    rows, meta = await paged(db, q, page, per_page, scalars=False)
    return {"items": [
        {"user_id": i, "email": e, "display_name": n, "invited": c, "completed": done, "last_invited_at": last}
        for i, e, n, c, done, last in rows
    ], **meta}


