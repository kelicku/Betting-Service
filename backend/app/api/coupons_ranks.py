"""会員向け：クーポンコードの入力。公開：当選ランクの表示名・演出。管理：クーポン発行・ランク設定。"""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select

from app.api.admin.common import paged, row_dict
from app.api.deps import DB, AdminUser, StaffUser, VerifiedUser, rate_limit
from app.core import cache
from app.core.errors import NotFound
from app.models import Coupon, CouponRedemption, RankEffect
from app.services import coupons, tickets
from app.services.audit import audit

router = APIRouter()
RANK_ORDER = ["SSR", "SR", "R", "N"]
RANK_FIELDS = ("rarity", "label", "video_url", "logo_url", "updated_at")
COUPON_FIELDS = ("id", "code", "kind", "tickets", "max_uses", "uses", "expires_at", "is_active", "note", "batch_id", "created_at")


# ── 会員：クーポンコード ───────────────────────────────────


class RedeemIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)


@router.post("/coupons/redeem", tags=["クーポン"],
             dependencies=[rate_limit("coupon", 10, 600, "user"), rate_limit("coupon_ip", 30, 3600)])
async def redeem(body: RedeemIn, user: VerifiedUser, db: DB):
    c = await coupons.redeem(db, user, body.code)
    return {"tickets": c.tickets, "balance": await tickets.get_balance(db, user.id),
            "message": f"チケット{c.tickets}枚を受け取りました！"}


# ── 公開：当選ランク ─────────────────────────────────────


async def _ranks(db) -> list[dict]:
    rows = {r.rarity: r for r in (await db.execute(select(RankEffect))).scalars()}
    default = {"SSR": "特賞", "SR": "大当たり", "R": "中当たり", "N": "小当たり"}
    return [
        {"rarity": k, "label": rows[k].label if k in rows else default[k],
         "video_url": rows[k].video_url if k in rows else None, "logo_url": rows[k].logo_url if k in rows else None}
        for k in RANK_ORDER
    ]


@router.get("/ranks", tags=["当選ランク"], summary="当選ランクの表示名・演出動画・ロゴ")
async def ranks(db: DB):
    return await cache.cached("ranks", 5.0, lambda: _ranks(db))


# ── 管理：当選ランク ─────────────────────────────────────


class RankIn(BaseModel):
    label: str = Field(min_length=1, max_length=20)
    video_url: str | None = Field(default=None, max_length=500)
    logo_url: str | None = Field(default=None, max_length=500)


@router.get("/admin/ranks", tags=["管理"])
async def admin_ranks(_: StaffUser, db: DB):
    return {"items": await _ranks(db)}


@router.put("/admin/ranks/{rarity}", tags=["管理"])
async def admin_update_rank(rarity: Literal["SSR", "SR", "R", "N"], body: RankIn, admin: AdminUser, request: Request, db: DB):
    r = await db.get(RankEffect, rarity)
    if r is None:
        r = RankEffect(rarity=rarity, label=body.label)
        db.add(r)
    r.label, r.video_url, r.logo_url = body.label.strip(), body.video_url or None, body.logo_url or None
    audit(db, admin, "rank.update", "rank", rarity, body.model_dump(), request)
    await db.commit()
    await db.refresh(r)  # 更新日時（DB 側で設定）を読み直す
    cache.invalidate("ranks")
    return row_dict(r, *RANK_FIELDS)


# ── 管理：クーポン ──────────────────────────────────────


class CouponIn(BaseModel):
    kind: Literal["single", "shared"]
    tickets: int = Field(ge=1, le=10000)
    count: int = Field(default=1, ge=1, le=1000)  # single：発行する枚数
    prefix: str = Field(default="", max_length=8, pattern=r"^[A-Za-z0-9]*$")  # single：コードの先頭に付ける文字（任意）
    code: str | None = Field(default=None, min_length=4, max_length=32, pattern=r"^[A-Za-z0-9\-_]+$")  # shared：あいことば
    max_uses: int = Field(default=100, ge=1, le=1_000_000)  # shared：先着の人数
    expires_at: datetime | None = None
    note: str = Field(default="", max_length=100)

    @model_validator(mode="after")
    def _check(self):
        if self.kind == "shared" and not self.code:
            raise ValueError("先着型のあいことばを入力してください")
        return self


@router.post("/admin/coupons", tags=["管理"])
async def create_coupons(body: CouponIn, admin: AdminUser, request: Request, db: DB):
    if body.kind == "single":
        made = await coupons.create_single(db, admin, body.count, body.tickets, body.prefix, body.expires_at, body.note)
    else:
        made = [await coupons.create_shared(db, admin, body.code or "", body.tickets, body.max_uses, body.expires_at, body.note)]
    audit(db, admin, "coupon.create", "coupon", made[0].batch_id or made[0].id,
          {"kind": body.kind, "tickets": body.tickets, "count": len(made), "max_uses": body.max_uses, "note": body.note}, request)
    await db.commit()
    return {"items": [row_dict(c, *COUPON_FIELDS) for c in made]}


@router.get("/admin/coupons", tags=["管理"])
async def list_coupons(
    _: StaffUser, db: DB, kind: Literal["single", "shared"] | None = None, q: str | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=1000),
):
    stmt = select(Coupon)
    if kind:
        stmt = stmt.where(Coupon.kind == kind)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Coupon.code.ilike(like) | Coupon.note.ilike(like) | (Coupon.batch_id == q.strip()))
    rows, meta = await paged(db, stmt.order_by(Coupon.id.desc()), page, per_page)
    total_uses = await db.scalar(select(func.count()).select_from(CouponRedemption)) or 0
    return {"items": [row_dict(c, *COUPON_FIELDS) for c in rows], "total_redemptions": total_uses, **meta}


class CouponActiveIn(BaseModel):
    is_active: bool


@router.post("/admin/coupons/{coupon_id}/active", tags=["管理"])
async def set_coupon_active(coupon_id: int, body: CouponActiveIn, admin: AdminUser, request: Request, db: DB):
    c = await db.get(Coupon, coupon_id)
    if c is None:
        raise NotFound("クーポンが見つかりません。")
    c.is_active = body.is_active
    audit(db, admin, "coupon.active", "coupon", c.id, {"is_active": body.is_active}, request)
    await db.commit()
    return row_dict(c, *COUPON_FIELDS)


