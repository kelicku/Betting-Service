"""ログインボーナスとミッション（キャンペーン・条件達成）。"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFound
from app.models import DailyLoginClaim, Draw, ExchangeRequest, Mission, MissionClaim, User
from app.models.enums import MissionCondition, MissionKind, TicketKind
from app.services import settings_store, tickets

JST = ZoneInfo("Asia/Tokyo")


def jst_today() -> str:
    return datetime.now(JST).date().isoformat()


async def daily_status(db: AsyncSession, user_id: int) -> dict:
    today = jst_today()
    last = await db.scalar(
        select(DailyLoginClaim).where(DailyLoginClaim.user_id == user_id).order_by(DailyLoginClaim.jst_date.desc()).limit(1)
    )
    claimed = last is not None and last.jst_date == today
    yesterday = (datetime.now(JST).date() - timedelta(days=1)).isoformat()
    streak = last.streak if last and last.jst_date in (today, yesterday) else 0
    base = await settings_store.get(db, "daily_login_tickets")
    bonus7 = await settings_store.get(db, "daily_login_streak7_bonus")
    next_streak = streak if claimed else streak + 1
    next_reward = base + (bonus7 if next_streak % 7 == 0 else 0)
    return {"claimed_today": claimed, "streak": streak, "next_reward": next_reward, "date": today}


async def claim_daily(db: AsyncSession, user: User) -> dict:
    today = jst_today()
    yesterday = (datetime.now(JST).date() - timedelta(days=1)).isoformat()
    await tickets.lock_wallet(db, user.id)
    prev = await db.scalar(
        select(DailyLoginClaim.streak).where(DailyLoginClaim.user_id == user.id, DailyLoginClaim.jst_date == yesterday)
    )
    streak = (prev or 0) + 1
    res = await db.execute(
        insert(DailyLoginClaim)
        .values(user_id=user.id, jst_date=today, streak=streak)
        .on_conflict_do_nothing(index_elements=["user_id", "jst_date"])
        .returning(DailyLoginClaim.id)
    )
    if res.scalar_one_or_none() is None:
        raise AppError("already_claimed", "本日のログインボーナスは受け取り済みです。また明日お越しください。", 409)
    base = await settings_store.get(db, "daily_login_tickets")
    bonus7 = await settings_store.get(db, "daily_login_streak7_bonus")
    amount = base + (bonus7 if streak % 7 == 0 else 0)
    if amount > 0:
        await tickets.credit(
            db, user.id, amount, TicketKind.daily_login,
            f"ログインボーナス（{streak}日連続）", dedupe_key=f"daily:{user.id}:{today}",
        )
    await db.commit()
    return {"amount": amount, "streak": streak}


async def _progress(db: AsyncSession, user: User, m: Mission) -> int:
    cond = MissionCondition(m.condition_type)
    if cond == MissionCondition.none:
        return 1
    if cond == MissionCondition.email_verified:
        return 1 if user.email_verified_at else 0
    if cond == MissionCondition.total_draws:
        return await db.scalar(select(func.coalesce(func.sum(Draw.count), 0)).where(Draw.user_id == user.id)) or 0
    if cond == MissionCondition.first_exchange:
        return await db.scalar(select(func.count()).select_from(ExchangeRequest).where(ExchangeRequest.user_id == user.id)) or 0
    if cond == MissionCondition.login_days:
        return await db.scalar(select(func.count()).select_from(DailyLoginClaim).where(DailyLoginClaim.user_id == user.id)) or 0
    return 0


def _target(m: Mission) -> int:
    return m.condition_value if m.condition_type in ("total_draws", "login_days") else 1


def mission_open(m: Mission, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    return m.is_active and (not m.starts_at or now >= m.starts_at) and (not m.ends_at or now < m.ends_at)


async def list_missions(db: AsyncSession, user: User) -> list[dict]:
    missions = (await db.execute(select(Mission).order_by(Mission.kind, Mission.id))).scalars().all()
    claimed = set(
        (await db.execute(select(MissionClaim.mission_id).where(MissionClaim.user_id == user.id))).scalars()
    )
    out = []
    for m in missions:
        if not mission_open(m) and m.id not in claimed:
            continue
        progress = await _progress(db, user, m)
        target = max(_target(m), 1)
        out.append({
            "id": m.id, "kind": m.kind, "title": m.title, "description": m.description,
            "reward_tickets": m.reward_tickets, "progress": min(progress, target), "target": target,
            "claimed": m.id in claimed, "claimable": m.id not in claimed and progress >= target and mission_open(m),
            "ends_at": m.ends_at,
        })
    return out


async def claim_mission(db: AsyncSession, user: User, mission_id: int) -> int:
    m = await db.get(Mission, mission_id)
    if m is None or not mission_open(m):
        raise NotFound("このミッションは現在受け取れません。")
    await tickets.lock_wallet(db, user.id)
    if await _progress(db, user, m) < max(_target(m), 1):
        raise AppError("not_achieved", "まだ達成条件を満たしていません。")
    res = await db.execute(
        insert(MissionClaim).values(mission_id=m.id, user_id=user.id)
        .on_conflict_do_nothing(index_elements=["mission_id", "user_id"]).returning(MissionClaim.id)
    )
    if res.scalar_one_or_none() is None:
        raise AppError("already_claimed", "この報酬は受け取り済みです。", 409)
    kind = TicketKind.campaign if m.kind == MissionKind.campaign else TicketKind.achievement
    await tickets.credit(
        db, user.id, m.reward_tickets, kind, m.title, dedupe_key=f"mission:{m.id}:{user.id}",
        ref_type="mission", ref_id=str(m.id),
    )
    await db.commit()
    return m.reward_tickets
