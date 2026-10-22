"""会員向け：ポイント（残高・履歴）、ポイント交換、SMS 認証、友達紹介。"""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser, OptionalUser, PhoneVerifiedUser, not_in_maintenance, rate_limit, verified_user
from app.models import PointTransaction, PointWallet
from app.schemas import Page, ShippingIn, TicketTxOut, WalletOut
from app.services import points, referrals, shop
from app.services import sms as sms_svc

router = APIRouter()
Maint = Depends(not_in_maintenance)


# ── ポイント ─────────────────────────────────────────────


@router.get("/points/wallet", response_model=WalletOut, tags=["ポイント"])
async def point_wallet(user: CurrentUser, db: DB):
    w = await db.get(PointWallet, user.id)
    return WalletOut(balance=w.balance if w else 0, total_earned=w.total_earned if w else 0, total_spent=w.total_spent if w else 0)


@router.get("/points/transactions", response_model=Page[TicketTxOut], tags=["ポイント"])
async def point_transactions(
    user: CurrentUser, db: DB, direction: Literal["all", "earn", "spend"] = "all",
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
):
    q = select(PointTransaction).where(PointTransaction.user_id == user.id)
    if direction == "earn":
        q = q.where(PointTransaction.delta > 0)
    elif direction == "spend":
        q = q.where(PointTransaction.delta < 0)
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = (await db.execute(q.order_by(PointTransaction.id.desc()).offset((page - 1) * per_page).limit(per_page))).scalars()
    return Page(items=[TicketTxOut.model_validate(r) for r in rows], total=total, page=page, per_page=per_page)


# ── ポイント交換 ───────────────────────────────────────────


@router.get("/shop/items", tags=["ポイント交換"])
async def shop_items(user: OptionalUser, db: DB):
    return await shop.list_items(db, user)


class ShopOrderIn(BaseModel):
    item_id: int
    idempotency_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9\-_]+$")
    shipping: ShippingIn | None = None
    save_address: bool = False


@router.post("/shop/orders", tags=["ポイント交換"], dependencies=[Maint, Depends(verified_user), rate_limit("shop", 20, 60, "user")])
async def create_shop_order(body: ShopOrderIn, user: PhoneVerifiedUser, db: DB):
    order = await shop.place_order(
        db, user, body.item_id, body.idempotency_key, body.shipping.model_dump() if body.shipping else None, body.save_address
    )
    o = await shop.load_order(db, order.id, user.id)
    return {**shop.order_out(o, reveal_code=True), "point_balance": await points.get_balance(db, user.id)}


@router.get("/shop/orders", tags=["ポイント交換"])
async def my_shop_orders(user: CurrentUser, db: DB, page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100)):
    from sqlalchemy.orm import selectinload

    from app.models import ShopOrder

    q = select(ShopOrder).where(ShopOrder.user_id == user.id)
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = (await db.execute(
        q.options(selectinload(ShopOrder.gift_code), selectinload(ShopOrder.item))
        .order_by(ShopOrder.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )).scalars()
    return {"items": [shop.order_out(o, reveal_code=True) for o in rows], "total": total, "page": page, "per_page": per_page}


@router.post("/shop/orders/{order_id}/cancel", tags=["ポイント交換"])
async def cancel_shop_order(order_id: uuid.UUID, user: CurrentUser, db: DB):
    o = await shop.cancel_by_user(db, user, order_id)
    return {**shop.order_out(o, reveal_code=True), "point_balance": await points.get_balance(db, user.id)}


# ── SMS 認証 ──────────────────────────────────────────────


class PhoneIn(BaseModel):
    phone: str = Field(min_length=10, max_length=20)


class PhoneCodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


@router.get("/phone", tags=["SMS 認証"])
async def phone_status(user: CurrentUser, db: DB):
    return {
        "verified": user.phone_verified_at is not None,
        "last4": user.phone_last4,
        "required": await sms_svc.is_required_for(db, user),
    }


@router.post("/phone/send-code", tags=["SMS 認証"], dependencies=[rate_limit("sms_send", 5, 600, "user"), rate_limit("sms_send_ip", 20, 3600)])
async def phone_send_code(body: PhoneIn, user: CurrentUser, db: DB):
    last4 = await sms_svc.request_code(db, user, body.phone)
    return {"message": f"末尾 {last4} の電話番号に確認コードを送信しました。", "last4": last4}


@router.post("/phone/verify", tags=["SMS 認証"], dependencies=[rate_limit("sms_verify", 10, 600, "user")])
async def phone_verify(body: PhoneCodeIn, user: CurrentUser, db: DB):
    await sms_svc.verify_code(db, user, body.code)
    return {"message": "電話番号の確認が完了しました。", "verified": True, "last4": user.phone_last4}


# ── 友達紹介 ──────────────────────────────────────────────


@router.get("/invite", tags=["友達紹介"])
async def invite_info(user: CurrentUser, db: DB):
    data = await referrals.stats(db, user)
    await db.commit()  # 招待コードを初めて発行した場合に保存
    return data
