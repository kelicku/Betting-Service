from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

JST = ZoneInfo("Asia/Tokyo")


async def paged(db: AsyncSession, q: Select, page: int, per_page: int, scalars: bool = True):
    total = await db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
    res = await db.execute(q.offset((page - 1) * per_page).limit(per_page))
    rows = list(res.scalars()) if scalars else list(res.all())
    return rows, {"total": total, "page": page, "per_page": per_page}


def jst_start(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=JST)


def row_dict(obj, *fields: str) -> dict:
    return {f: getattr(obj, f) for f in fields}
