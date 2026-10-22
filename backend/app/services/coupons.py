"""クーポンコード（チケットを配布する）。

- 使い捨て型（single）：1 つのコードは 1 回だけ使える。管理画面でまとめて発行し、SNS の DM などで個別に配る
- 先着型（shared）：全員共通のあいことば。指定した回数（先着 N 名）に達したら自動で無効。1 人 1 回まで
- 同時に使われても上限を超えないよう、コードの行をロックしてから数える（さらに CHECK 制約で uses <= max_uses）
- ロックの順番は「クーポン → チケット残高」
"""

import secrets
import unicodedata
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models import Coupon, CouponRedemption, Notification, User
from app.models.enums import TicketKind
from app.services import tickets

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 読み間違えやすい文字（0/O・1/I）を除く


def normalize(code: str) -> str:
    """全角・小文字・前後の空白を吸収する（「ｗａｋｕ１」→「WAKU1」）。"""
    return unicodedata.normalize("NFKC", code).strip().upper().replace(" ", "")


def new_code(prefix: str = "") -> str:
    return normalize(prefix) + "".join(secrets.choice(ALPHABET) for _ in range(10))


async def redeem(db: AsyncSession, user: User, raw: str) -> Coupon:
    code = normalize(raw)
    c = (await db.execute(select(Coupon).where(Coupon.code == code).with_for_update())).scalar_one_or_none() if code else None
    if c is None or not c.is_active:
        raise AppError("coupon_invalid", "クーポンコードが正しくないか、利用できません。")
    if c.expires_at and c.expires_at < datetime.now(UTC):
        raise AppError("coupon_expired", "このクーポンコードは有効期限が切れています。")
    if c.uses >= c.max_uses:
        raise AppError("coupon_used_up", "このクーポンコードは使用済み、または先着の上限に達しました。")
    if await db.scalar(select(CouponRedemption.id).where(CouponRedemption.coupon_id == c.id, CouponRedemption.user_id == user.id)):
        raise AppError("coupon_already_used", "このクーポンコードは既に使用済みです。")
    db.add(CouponRedemption(coupon_id=c.id, user_id=user.id))
    c.uses += 1
    try:
        await db.flush()
    except IntegrityError as e:  # 同じ人が同時に 2 回送った場合
        await db.rollback()
        raise AppError("coupon_already_used", "このクーポンコードは既に使用済みです。") from e
    await tickets.credit(db, user.id, c.tickets, TicketKind.coupon, "クーポンコード", dedupe_key=f"coupon:{c.id}:{user.id}",
                         ref_type="coupon", ref_id=str(c.id))
    db.add(Notification(user_id=user.id, kind="coupon", title="クーポンでチケットを受け取りました",
                        body=f"クーポンコードでチケット{c.tickets}枚を受け取りました。", link="/gacha"))
    await db.commit()
    return c


async def create_single(db: AsyncSession, admin: User, count: int, tickets_n: int, prefix: str, expires_at, note: str) -> list[Coupon]:
    batch = secrets.token_hex(6)
    out: list[Coupon] = []
    used: set[str] = set()
    while len(out) < count:
        code = new_code(prefix)
        if code in used or await db.scalar(select(Coupon.id).where(Coupon.code == code)):
            continue
        used.add(code)
        c = Coupon(code=code, kind="single", tickets=tickets_n, max_uses=1, expires_at=expires_at, note=note, batch_id=batch,
                   created_by=admin.id)
        db.add(c)
        out.append(c)
    await db.flush()
    return out


async def create_shared(db: AsyncSession, admin: User, code: str, tickets_n: int, max_uses: int, expires_at, note: str) -> Coupon:
    code = normalize(code)
    if await db.scalar(select(Coupon.id).where(Coupon.code == code)):
        raise AppError("coupon_exists", "このあいことばは既に使われています。別の文字列にしてください。")
    c = Coupon(code=code, kind="shared", tickets=tickets_n, max_uses=max_uses, expires_at=expires_at, note=note, created_by=admin.id)
    db.add(c)
    await db.flush()
    return c
