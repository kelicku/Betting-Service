"""個人情報の保持期間の管理：保持期間を過ぎた IP アドレスの消去。"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OfferClick, User, UserSession
from app.services import settings_store


async def purge_old_ips(db: AsyncSession, now: datetime | None = None) -> dict[str, int]:
    """保持期間（ip_retention_days）を過ぎた IP アドレスを消去する（記録そのもの・会員は残す）。"""
    days = int(await settings_store.get(db, "ip_retention_days"))
    cutoff = (now or datetime.now(UTC)) - timedelta(days=max(days, 1))
    counts = {}
    for name, model, col, at in (
        ("users", User, User.signup_ip, User.created_at),
        ("sessions", UserSession, UserSession.ip, UserSession.created_at),
        ("offer_clicks", OfferClick, OfferClick.ip, OfferClick.created_at),
    ):
        r = await db.execute(update(model).where(col.is_not(None), at < cutoff).values({col.key: None}))
        counts[name] = r.rowcount or 0
    await db.commit()
    return counts
