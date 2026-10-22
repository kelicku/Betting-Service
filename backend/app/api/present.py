"""DB モデル → API レスポンスへの変換。"""

from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Draw, ExchangeRequest, Gacha, GachaItem, LastOneAward, Prize
from app.models.enums import RARITY_ORDER, GachaMode, GachaStatus, Rarity
from app.schemas import (
    DrawOut,
    DrawResultOut,
    ExchangeItemOut,
    ExchangeOut,
    GachaDetailOut,
    GachaItemOut,
    GachaSummaryOut,
    PrizeOut,
)
from app.services import draw_engine
from app.services.exchange import STATUS_LABELS


def prize_out(p: Prize) -> PrizeOut:
    return PrizeOut.model_validate(p)


def item_probabilities(gacha: Gacha, items: list[GachaItem]) -> dict[int, float]:
    """現在の提供割合（各景品が次の 1 回で出る確率）。"""
    active = [i for i in items if i.is_active]
    if gacha.mode == GachaMode.box:
        weights = {i.id: i.stock_remaining or 0 for i in active}
    else:
        weights = {
            i.id: (i.weight if (i.stock_remaining is None or i.stock_remaining > 0) else 0) for i in active
        }
    total = sum(weights.values())
    return {k: (v / total if total else 0.0) for k, v in weights.items()}


async def load_gachas(
    db: AsyncSession, ids: list[int] | None = None, slug: str | None = None, published_only: bool = False
) -> list[Gacha]:
    q = select(Gacha).options(
        selectinload(Gacha.items).selectinload(GachaItem.prize),
        selectinload(Gacha.last_one_prize),
    )
    if ids is not None:
        q = q.where(Gacha.id.in_(ids))
    if slug is not None:
        q = q.where(Gacha.slug == slug)
    if published_only:
        q = q.where(Gacha.status == GachaStatus.published)
    return list((await db.execute(q.order_by(Gacha.sort_order, Gacha.id))).scalars())


async def awarded_gacha_ids(db: AsyncSession, ids: list[int]) -> set[int]:
    if not ids:
        return set()
    return set((await db.execute(select(LastOneAward.gacha_id).where(LastOneAward.gacha_id.in_(ids)))).scalars())


def _total_pulls(g: Gacha) -> int | None:
    if g.mode == GachaMode.box:
        return sum(i.stock_total or 0 for i in g.items if i.is_active)
    return g.max_pulls


def gacha_summary(g: Gacha, awarded: set[int]) -> GachaSummaryOut:
    active = [i for i in g.items if i.is_active]
    top = max((i.prize for i in active), key=lambda p: (RARITY_ORDER[Rarity(p.rarity)], -p.id), default=None)
    return GachaSummaryOut(
        id=g.id,
        slug=g.slug,
        title=g.title,
        subtitle=g.subtitle,
        banner_image_url=g.banner_image_url,
        theme_color=g.theme_color,
        ticket_cost=g.ticket_cost,
        mode=g.mode,
        starts_at=g.starts_at,
        ends_at=g.ends_at,
        is_open=draw_engine.is_open(g),
        remaining=draw_engine.remaining_pulls(g, g.items),
        total_pulls=_total_pulls(g),
        has_last_one=draw_engine.has_last_one(g),
        last_one_awarded=g.id in awarded,
        top_rarity=top.rarity if top else None,
        featured_prize=prize_out(g.last_one_prize) if g.last_one_prize else (prize_out(top) if top else None),
        badge=g.badge,
        pulls_done=g.pulls_done,
    )


def gacha_detail(g: Gacha, awarded: set[int]) -> GachaDetailOut:
    probs = item_probabilities(g, g.items)
    items = [
        GachaItemOut(
            prize=prize_out(i.prize),
            probability=probs.get(i.id, 0.0),
            stock_total=i.stock_total,
            stock_remaining=i.stock_remaining,
        )
        for i in sorted(
            (i for i in g.items if i.is_active),
            key=lambda i: (-RARITY_ORDER[Rarity(i.prize.rarity)], i.sort_order, i.id),
        )
    ]
    rates: dict[str, float] = {r.value: 0.0 for r in Rarity}
    for it in items:
        rates[it.prize.rarity] += it.probability
    base = gacha_summary(g, awarded)
    return GachaDetailOut(
        **base.model_dump(),
        description=g.description,
        allow_multi_10=g.allow_multi_10,
        allow_multi_100=g.allow_multi_100,
        items=items,
        rarity_rates=rates,
        last_one_prize=prize_out(g.last_one_prize) if (g.last_one_prize and draw_engine.has_last_one(g)) else None,
        last_one_description=g.last_one_description,
    )


def draw_out(d: Draw, balance_after: int | None = None, replayed: bool = False, point_balance_after: int | None = None) -> DrawOut:
    counts = Counter(r.rarity for r in d.results if not r.is_last_one)
    return DrawOut(
        id=d.id,
        gacha_id=d.gacha_id,
        gacha_title=d.gacha.title,
        gacha_slug=d.gacha.slug,
        count=d.count,
        tickets_spent=d.tickets_spent,
        best_rarity=d.best_rarity,
        has_last_one=d.has_last_one,
        created_at=d.created_at,
        results=[
            DrawResultOut(position=r.position, prize=prize_out(r.prize), rarity=r.rarity, is_last_one=r.is_last_one, point_value=r.point_value)
            for r in d.results
        ],
        rarity_counts={r.value: counts.get(r.value, 0) for r in Rarity},
        points_won=d.points_won,
        balance_after=balance_after,
        point_balance_after=point_balance_after,
        replayed=replayed,
    )


def exchange_out(req: ExchangeRequest) -> ExchangeOut:
    return ExchangeOut(
        id=req.id,
        status=req.status,
        status_label=STATUS_LABELS[req.status],
        recipient_masked=req.recipient_masked,
        carrier=req.carrier,
        tracking_number=req.tracking_number,
        admin_note=req.admin_note if req.status == "rejected" else None,
        user_message=req.user_message,
        created_at=req.created_at,
        updated_at=req.updated_at,
        items=[
            ExchangeItemOut(user_prize_id=it.user_prize_id, prize=prize_out(it.user_prize.prize))
            for it in req.items
        ],
    )
