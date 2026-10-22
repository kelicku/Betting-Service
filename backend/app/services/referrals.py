"""友達紹介（招待コード）。

- 各会員に 8 文字の招待コードを発行する（読み間違えやすい文字は使わない）
- 新規登録時に招待コードを入力（または ?ref= 付きのリンクから登録）すると、紹介者が記録される
- 紹介された人が登録を完了したとき（メール認証、SMS 認証が必須ならその完了時）に、双方へチケットを付与する
- 不正対策：自分自身・お試しアカウントは対象外、付与は 1 人 1 回（dedupe_key）、紹介者への付与は 1 日 10 人まで
"""

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, User
from app.models.enums import TicketKind
from app.services import settings_store, tickets

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITER_DAILY_CAP = 10


def _new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


async def ensure_invite_code(db: AsyncSession, user: User) -> str:
    if user.invite_code:
        return user.invite_code
    for _ in range(10):
        code = _new_code()
        if not await db.scalar(select(User.id).where(User.invite_code == code)):
            user.invite_code = code
            await db.flush()
            return code
    raise RuntimeError("could not allocate invite code")


async def find_inviter(db: AsyncSession, code: str | None) -> User | None:
    if not code:
        return None
    code = code.strip().upper()
    if not code or len(code) > 16:
        return None
    return await db.scalar(select(User).where(User.invite_code == code))


async def maybe_reward(db: AsyncSession, user: User) -> bool:
    """紹介された人の登録が完了していれば、双方にチケットを付与する。呼び出し側で commit する。"""
    from app.services import sms
    from app.services.auth import is_demo_user

    if not user.referred_by_id or user.referral_rewarded_at or user.email_verified_at is None:
        return False
    if await sms.is_required_for(db, user):
        return False  # SMS 認証の完了を待つ
    inviter = await db.get(User, user.referred_by_id)
    if inviter is None or inviter.id == user.id or is_demo_user(user) or is_demo_user(inviter):
        return False
    user.referral_rewarded_at = datetime.now(UTC)
    invitee_n = await settings_store.get(db, "referral_invitee_tickets")
    inviter_n = await settings_store.get(db, "referral_inviter_tickets")
    if invitee_n > 0:
        await tickets.credit(db, user.id, invitee_n, TicketKind.referral, "友達紹介の特典（招待コードで登録）",
                             dedupe_key=f"referral-invitee:{user.id}", ref_type="user", ref_id=str(inviter.id))
        db.add(Notification(user_id=user.id, kind="referral", title="友達紹介の特典をお贈りしました",
                            body=f"招待コードでのご登録ありがとうございます。チケット{invitee_n}枚をお贈りしました。", link="/gacha"))
    # 紹介者への付与は 1 日 10 人まで（大量の捨てアカウントによる不正取得を抑える）
    since = datetime.now(UTC) - timedelta(days=1)
    today = await db.scalar(
        select(func.count()).select_from(User).where(User.referred_by_id == inviter.id, User.referral_rewarded_at >= since, User.id != user.id)
    ) or 0
    if inviter_n > 0 and today < INVITER_DAILY_CAP:
        await tickets.credit(db, inviter.id, inviter_n, TicketKind.referral, f"友達紹介の特典（{user.display_name}さんが登録）",
                             dedupe_key=f"referral-inviter:{user.id}", ref_type="user", ref_id=str(user.id))
        db.add(Notification(user_id=inviter.id, kind="referral", title="お友達が登録しました",
                            body=f"{user.display_name}さんがあなたの招待コードで登録しました。チケット{inviter_n}枚をお贈りしました。", link="/invite"))
    await db.flush()
    return True


async def stats(db: AsyncSession, user: User) -> dict:
    invited = await db.scalar(select(func.count()).select_from(User).where(User.referred_by_id == user.id)) or 0
    completed = await db.scalar(
        select(func.count()).select_from(User).where(User.referred_by_id == user.id, User.referral_rewarded_at.is_not(None))
    ) or 0
    return {
        "invite_code": await ensure_invite_code(db, user),
        "invited": invited,
        "completed": completed,
        "inviter_tickets": await settings_store.get(db, "referral_inviter_tickets"),
        "invitee_tickets": await settings_store.get(db, "referral_invitee_tickets"),
    }
