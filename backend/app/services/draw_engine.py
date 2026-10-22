"""ガチャ抽選エンジン。

抽選はすべてサーバー側で、1 つの DB トランザクション内で完結する。

  1. ユーザーのチケット残高行をロック（同一ユーザーの同時抽選を直列化）
  2. 冪等キーを確認（同じキーの再送には保存済みの結果を返し、二重消費しない）
  3. ガチャ行・景品行をロック（同一ガチャへの同時抽選を直列化し、在庫・残り口数・
     ラストワン賞の判定を正確にする）
  4. 条件（公開状態・期間・残り口数・在庫・チケット）を検証。
     まとめ引きで 1 つでも条件を満たせない場合は全体を実行しない
  5. CSPRNG（secrets.SystemRandom）で抽選
  6. チケット消費・在庫減算・抽選結果・所持景品・ラストワン賞を保存して COMMIT

結果は COMMIT 後にクライアントへ返されるため、アニメーションをスキップしても、
通信が途中で切れても結果は変わらない（GET /api/draws/{id} で再取得可能）。

ロック順序は常に「ticket_wallets → gachas → gacha_items」で、デッドロックを起こさない。
"""

import secrets
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, NotFound
from app.core.security import hmac_hex
from app.models import (
    Draw,
    DrawResult,
    Gacha,
    GachaItem,
    LastOneAward,
    Notification,
    Prize,
    User,
    UserPrize,
)
from app.models.enums import (
    RARITY_ORDER,
    GachaMode,
    GachaStatus,
    PointKind,
    PrizeSource,
    Rarity,
    TicketKind,
    UserPrizeStatus,
)
from app.services import points, tickets

ALLOWED_COUNTS = (1, 10, 100)
_rng = secrets.SystemRandom()


class DrawError(AppError):
    status_code = 409


@dataclass
class Pool:
    """抽選対象の景品（ガチャ内アイテム）と、その残り在庫。"""

    item_id: int
    prize_id: int
    weight: int
    remaining: int | None  # None = 無制限


def pick(pool: list[Pool], mode: str, rng=_rng) -> Pool:
    """1 回分の抽選。ボックス方式は残り在庫数、確率方式は設定重みに比例して選ぶ。"""
    if mode == GachaMode.box:
        candidates = [(p, p.remaining) for p in pool if p.remaining]
    else:
        candidates = [
            (p, p.weight) for p in pool if p.weight > 0 and (p.remaining is None or p.remaining > 0)
        ]
    total = sum(w for _, w in candidates)
    if total <= 0:
        raise DrawError("sold_out", "景品の在庫がなくなりました。")
    r = rng.randrange(total)
    for p, w in candidates:
        if r < w:
            return p
        r -= w
    raise AssertionError("unreachable")


def remaining_pulls(gacha: Gacha, items: list[GachaItem]) -> int | None:
    """残り口数。None は無制限。"""
    active = [i for i in items if i.is_active]
    if gacha.mode == GachaMode.box:
        return sum(i.stock_remaining or 0 for i in active)
    caps: list[int] = []
    if gacha.max_pulls is not None:
        caps.append(max(gacha.max_pulls - gacha.pulls_done, 0))
    drawable = [i for i in active if i.weight > 0]
    if drawable and all(i.stock_remaining is not None for i in drawable):
        # 確率方式でも、抽選対象のすべてが在庫制限付きなら在庫合計が上限になる
        caps.append(sum(i.stock_remaining or 0 for i in drawable))
    elif not drawable:
        caps.append(0)
    return min(caps) if caps else None


def has_last_one(gacha: Gacha) -> bool:
    """ラストワン賞は「最後の 1 口」が定義できるガチャ（ボックス方式、または総口数上限あり）でのみ有効。"""
    return gacha.last_one_prize_id is not None and (
        gacha.mode == GachaMode.box or gacha.max_pulls is not None
    )


def digest_for(draw_id: uuid.UUID, user_id: int, gacha_id: int, prize_ids: list[int]) -> str:
    payload = f"{draw_id}|{user_id}|{gacha_id}|" + ",".join(map(str, prize_ids))
    return hmac_hex(payload)


def verify_digest(draw: Draw, results: list[DrawResult]) -> bool:
    expected = digest_for(draw.id, draw.user_id, draw.gacha_id, [r.prize_id for r in results])
    return secrets.compare_digest(expected, draw.result_digest)


def is_open(gacha: Gacha, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    if gacha.status != GachaStatus.published:
        return False
    if gacha.starts_at and now < gacha.starts_at:
        return False
    if gacha.ends_at and now >= gacha.ends_at:
        return False
    return True


async def load_draw(db: AsyncSession, draw_id: uuid.UUID, user_id: int | None = None) -> Draw:
    q = (
        select(Draw)
        .where(Draw.id == draw_id)
        .options(
            selectinload(Draw.results).selectinload(DrawResult.prize),
            selectinload(Draw.gacha),
        )
    )
    if user_id is not None:
        q = q.where(Draw.user_id == user_id)
    draw = (await db.execute(q)).scalar_one_or_none()
    if draw is None:
        raise NotFound("抽選結果が見つかりません。")
    return draw


async def execute_draw(
    db: AsyncSession, user: User, gacha_id: int, count: int, idempotency_key: str
) -> tuple[Draw, bool]:
    """抽選を実行して COMMIT し、(Draw, replayed) を返す。replayed=True は冪等キーによる再送。"""
    if count not in ALLOWED_COUNTS:
        raise AppError("invalid_count", "抽選回数は 1・10・100 回のいずれかを指定してください。")

    # 1) 同一ユーザーの抽選を直列化
    wallet = await tickets.lock_wallet(db, user.id)

    # 2) 冪等キーの確認
    existing_id = await db.scalar(
        select(Draw.id).where(Draw.user_id == user.id, Draw.idempotency_key == idempotency_key)
    )
    if existing_id is not None:
        draw = await load_draw(db, existing_id, user.id)
        if draw.gacha_id != gacha_id or draw.count != count:
            raise AppError("idempotency_mismatch", "リクエストの内容が一致しません。", status_code=422)
        return draw, True

    # 3) 事前確認（ロックなし）：完売・チケット不足は、ガチャのロックを待たずにすぐ断る。
    #    ラストワン賞の終盤など、同じガチャに抽選が集中したときの待ち時間を減らすため。最終的な確認は 4) でロック後に行う
    pre = (await db.execute(select(Gacha.ticket_cost, Gacha.mode, Gacha.max_pulls, Gacha.pulls_done).where(Gacha.id == gacha_id))).first()
    if pre is None:
        raise NotFound("ガチャが見つかりません。")
    if wallet.balance < pre.ticket_cost * count:
        raise tickets.insufficient(pre.ticket_cost * count, wallet.balance)
    if pre.mode == GachaMode.box:
        left = await db.scalar(
            select(func.coalesce(func.sum(GachaItem.stock_remaining), 0)).where(GachaItem.gacha_id == gacha_id, GachaItem.is_active.is_(True))
        )
        if left is not None and left <= 0:
            raise DrawError("sold_out", "このガチャは完売しました。", remaining=0)
    elif pre.max_pulls is not None and pre.pulls_done >= pre.max_pulls:
        raise DrawError("sold_out", "このガチャは完売しました。", remaining=0)

    # 4) ガチャと景品をロック
    gacha = (
        await db.execute(
            select(Gacha)
            .where(Gacha.id == gacha_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if gacha is None:
        raise NotFound("ガチャが見つかりません。")
    items = list(
        (
            await db.execute(
                select(GachaItem)
                .where(GachaItem.gacha_id == gacha.id)
                .order_by(GachaItem.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )

    # 5) 条件の検証（ロック後の正確な値で）
    if not is_open(gacha):
        raise DrawError("gacha_closed", "このガチャは現在開催されていません。")
    if count == 10 and not gacha.allow_multi_10:
        raise DrawError("multi_not_allowed", "このガチャでは10回まとめて引くことはできません。")
    if count == 100 and not gacha.allow_multi_100:
        raise DrawError("multi_not_allowed", "このガチャでは100回まとめて引くことはできません。")

    remaining = remaining_pulls(gacha, items)
    if remaining is not None and remaining <= 0:
        raise DrawError("sold_out", "このガチャは完売しました。", remaining=0)
    if remaining is not None and count > remaining:
        raise DrawError(
            "not_enough_remaining",
            f"残り口数が不足しています（残り{remaining}口）。まとめ引きの回数を減らしてお試しください。",
            remaining=remaining,
        )

    cost = gacha.ticket_cost * count
    if wallet.balance < cost:
        raise tickets.insufficient(cost, wallet.balance)

    # 6) 抽選
    pool = [
        Pool(i.id, i.prize_id, i.weight, i.stock_remaining) for i in items if i.is_active
    ]
    by_item = {p.item_id: p for p in pool}
    picks: list[Pool] = []
    for _ in range(count):
        p = pick(pool, gacha.mode)
        if p.remaining is not None:
            p.remaining -= 1
        picks.append(p)

    awards_last_one = False
    if has_last_one(gacha) and remaining is not None and count == remaining:
        # 既に付与済み（付与後に運営が在庫を追加した場合など）なら、2 回目は付与しない（一意制約での失敗を避ける）
        already = await db.scalar(select(LastOneAward.id).where(LastOneAward.gacha_id == gacha.id))
        awards_last_one = already is None

    # 6) 保存
    prize_ids = {p.prize_id for p in picks}
    if awards_last_one:
        prize_ids.add(gacha.last_one_prize_id)
    prizes = {
        p.id: p for p in (await db.execute(select(Prize).where(Prize.id.in_(prize_ids)))).scalars()
    }

    draw_id = uuid.uuid4()
    result_prize_ids = [p.prize_id for p in picks] + (
        [gacha.last_one_prize_id] if awards_last_one else []
    )
    best = max((prizes[pid].rarity for pid in result_prize_ids), key=lambda r: RARITY_ORDER[Rarity(r)])

    await tickets.debit(
        db, user.id, cost, TicketKind.gacha_draw,
        f"{gacha.title}（{count}回）",
        wallet=wallet, dedupe_key=f"draw:{draw_id}", ref_type="draw", ref_id=str(draw_id),
    )

    draw = Draw(
        id=draw_id,
        user_id=user.id,
        gacha_id=gacha.id,
        count=count,
        tickets_spent=cost,
        idempotency_key=idempotency_key,
        result_digest=digest_for(draw_id, user.id, gacha.id, result_prize_ids),
        has_last_one=awards_last_one,
        best_rarity=best,
    )
    db.add(draw)
    await db.flush()

    results: list[DrawResult] = []
    for pos, pid in enumerate(result_prize_ids):
        is_lo = awards_last_one and pos == len(result_prize_ids) - 1
        prize = prizes[pid]
        results.append(
            DrawResult(
                draw_id=draw_id,
                position=pos,
                prize_id=pid,
                gacha_item_id=None if is_lo else picks[pos].item_id,
                rarity=prize.rarity,
                prize_name=prize.name,
                is_last_one=is_lo,
                point_value=prize.point_value or 0,
            )
        )
    db.add_all(results)
    await db.flush()

    # ポイント景品はポイント残高に加算する（獲得した景品一覧・交換申請の対象にはしない）
    points_won = sum(r.point_value for r in results)
    if points_won > 0:
        draw.points_won = points_won
        await points.credit(
            db, user.id, points_won, PointKind.gacha_win, f"{gacha.title}（{count}回）で獲得",
            dedupe_key=f"draw-points:{draw_id}", ref_type="draw", ref_id=str(draw_id),
        )

    db.add_all(
        UserPrize(
            user_id=user.id,
            prize_id=r.prize_id,
            source=PrizeSource.last_one if r.is_last_one else PrizeSource.draw,
            draw_id=draw_id,
            draw_result_id=r.id,
            gacha_id=gacha.id,
            status=UserPrizeStatus.owned,
        )
        for r in results
        if r.point_value == 0
    )

    # 在庫の減算（CHECK 制約 stock_remaining >= 0 が最終防衛線）
    for item_id, n in Counter(p.item_id for p in picks).items():
        if by_item[item_id].remaining is not None:
            res = await db.execute(
                update(GachaItem)
                .where(GachaItem.id == item_id, GachaItem.stock_remaining >= n)
                .values(stock_remaining=GachaItem.stock_remaining - n)
            )
            if res.rowcount != 1:
                raise DrawError("stock_conflict", "在庫の更新に失敗しました。もう一度お試しください。")
    gacha.pulls_done += count

    if awards_last_one:
        # gacha_id の一意制約により、万一の競合時もラストワン賞は 1 件しか保存されない
        db.add(
            LastOneAward(
                gacha_id=gacha.id, user_id=user.id, draw_id=draw_id, prize_id=gacha.last_one_prize_id
            )
        )
        db.add(
            Notification(
                user_id=user.id,
                kind="last_one",
                title="ラストワン賞獲得！",
                body=f"「{gacha.title}」のラストワン賞「{prizes[gacha.last_one_prize_id].name}」を獲得しました。",
                link="/prizes",
            )
        )

    await db.commit()
    return await load_draw(db, draw_id, user.id), False
