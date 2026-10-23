"""ガチャ・チケット：1/10/100 回抽選、確率検証、在庫、売り切れ、二重消費防止、同時アクセス、再試行、改ざん検知。"""

import asyncio
import random
from collections import Counter

from sqlalchemy import func, select

from app.models import Draw, GachaItem, TicketTransaction, UserPrize
from app.services.draw_engine import Pool, pick
from tests.conftest import balance_of, create_gacha, create_user, key, login_as


async def _draw(client, gacha_id, count=1, k=None):
    return await client.post(f"/api/gachas/{gacha_id}/draw", json={"count": count, "idempotency_key": k or key()})


async def test_single_draw_consumes_tickets_and_records(client, db_session):
    u = await create_user(balance=5)
    g = await create_gacha(cost=2)
    await login_as(client, u)
    r = await _draw(client, g.id, 1)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] == 1 and len(body["results"]) == 1
    assert body["tickets_spent"] == 2 and body["balance_after"] == 3
    async with db_session() as db:
        tx = (await db.execute(select(TicketTransaction).where(TicketTransaction.kind == "gacha_draw"))).scalar_one()
        assert tx.delta == -2 and tx.balance_after == 3
        assert await db.scalar(select(func.count()).select_from(UserPrize).where(UserPrize.user_id == u.id)) == 1


async def test_ten_and_hundred_draws(client):
    u = await create_user(balance=110)
    g = await create_gacha(cost=1)
    await login_as(client, u)
    r10 = await _draw(client, g.id, 10)
    assert r10.status_code == 200 and len(r10.json()["results"]) == 10
    r100 = await _draw(client, g.id, 100)
    body = r100.json()
    assert r100.status_code == 200 and len(body["results"]) == 100
    assert sum(body["rarity_counts"].values()) == 100
    assert await balance_of(u.id) == 0


async def test_invalid_count_rejected(client):
    u = await create_user(balance=10)
    g = await create_gacha()
    await login_as(client, u)
    r = await _draw(client, g.id, 5)
    assert r.status_code == 422


async def test_insufficient_tickets_no_partial_draw(client, db_session):
    u = await create_user(balance=9)
    g = await create_gacha(cost=1)
    await login_as(client, u)
    r = await _draw(client, g.id, 10)
    assert r.status_code == 402
    assert r.json()["error"]["code"] == "insufficient_tickets"
    assert await balance_of(u.id) == 9
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(Draw)) == 0


async def test_idempotent_retry_does_not_double_charge(client, db_session):
    """通信エラーで再送しても同じ冪等キーなら結果は同じで、チケットは 1 回分しか消費されない。"""
    u = await create_user(balance=20)
    g = await create_gacha(cost=1)
    await login_as(client, u)
    k = key()
    r1 = await _draw(client, g.id, 10, k)
    r2 = await _draw(client, g.id, 10, k)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    assert r1.json()["results"] == r2.json()["results"]
    assert r2.json()["replayed"] is True
    assert await balance_of(u.id) == 10
    # 冪等キーから結果を再取得できる（アニメーション中に通信が切れた場合の復旧）
    r3 = await client.get(f"/api/draws/by-key/{k}")
    assert r3.json()["results"] == r1.json()["results"]


async def test_concurrent_double_click_same_key(client):
    """連続クリック（同じ冪等キーの同時送信）でも 1 回分しか消費されない。"""
    u = await create_user(balance=10)
    g = await create_gacha(cost=1)
    await login_as(client, u)
    k = key()
    rs = await asyncio.gather(*[_draw(client, g.id, 1, k) for _ in range(8)])
    assert all(r.status_code == 200 for r in rs), [r.text for r in rs]
    assert len({r.json()["id"] for r in rs}) == 1
    assert await balance_of(u.id) == 9


async def test_concurrent_draws_never_overspend(client, db_session):
    """残高 10 枚のユーザーが別々のキーで同時に 30 回引いても、成功は 10 回まで・残高は負にならない。"""
    u = await create_user(balance=10)
    g = await create_gacha(cost=1)
    await login_as(client, u)
    rs = await asyncio.gather(*[_draw(client, g.id, 1) for _ in range(30)])
    ok = [r for r in rs if r.status_code == 200]
    assert len(ok) == 10
    assert all(r.status_code == 402 for r in rs if r.status_code != 200)
    assert await balance_of(u.id) == 0
    async with db_session() as db:
        total = await db.scalar(select(func.sum(TicketTransaction.delta)).where(TicketTransaction.user_id == u.id))
        assert total == 0  # 付与 10 − 消費 10：台帳と残高が一致


async def test_box_stock_decrements_and_sold_out(client, db_session):
    u = await create_user(balance=100)
    g = await create_gacha(mode="box", items=[("N", 0, 6), ("R", 0, 3), ("SSR", 0, 1)])
    await login_as(client, u)
    r = await _draw(client, g.id, 1)
    assert r.status_code == 200
    detail = (await client.get(f"/api/gachas/{g.slug}")).json()
    assert detail["remaining"] == 9
    # 残り 9 口に対して 10 回まとめ引きは全体を実行しない
    r = await _draw(client, g.id, 10)
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_enough_remaining"
    assert r.json()["error"]["remaining"] == 9
    assert await balance_of(u.id) == 99
    for _ in range(9):
        assert (await _draw(client, g.id, 1)).status_code == 200
    r = await _draw(client, g.id, 1)
    assert r.status_code == 409 and r.json()["error"]["code"] == "sold_out"
    async with db_session() as db:
        stocks = (await db.execute(select(GachaItem.stock_remaining).where(GachaItem.gacha_id == g.id))).scalars().all()
        assert sorted(stocks) == [0, 0, 0]
        got = Counter(
            (await db.execute(select(UserPrize.prize_id).where(UserPrize.user_id == u.id))).scalars().all()
        )
        assert sorted(got.values()) == [1, 3, 6]  # ボックスの中身をちょうど全部引いた


async def test_concurrent_box_draws_never_oversell(make_client, db_session):
    """在庫 20 口のボックスに 10 人が同時に 3 回ずつ（計 30 回）引いても、ちょうど 20 口しか出ない。"""
    g = await create_gacha(mode="box", items=[("N", 0, 15), ("SR", 0, 5)])
    users = [await create_user(balance=5) for _ in range(10)]
    clients = []
    for u in users:
        c = await make_client()
        await login_as(c, u)
        clients.append(c)
    rs = await asyncio.gather(*[_draw(c, g.id, 1) for c in clients for _ in range(3)])
    ok = [r for r in rs if r.status_code == 200]
    assert len(ok) == 20
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(UserPrize)) == 20
        assert await db.scalar(select(func.sum(GachaItem.stock_remaining)).where(GachaItem.gacha_id == g.id)) == 0
    spent = sum([5 - await balance_of(u.id) for u in users])
    assert spent == 20  # 失敗した抽選ではチケットを消費しない


async def test_limited_stock_in_probability_mode(client):
    """確率方式で在庫制限付きの景品は在庫切れ後に出なくなる。"""
    u = await create_user(balance=200)
    g = await create_gacha(items=[("N", 1, None), ("SSR", 1000, 2)])
    await login_as(client, u)
    r = await _draw(client, g.id, 100)
    counts = r.json()["rarity_counts"]
    assert counts["SSR"] == 2 and counts["N"] == 98


async def test_closed_and_unpublished_gacha(client):
    from datetime import UTC, datetime, timedelta

    u = await create_user(balance=10)
    g1 = await create_gacha(status="draft")
    g2 = await create_gacha(ends_at=datetime.now(UTC) - timedelta(minutes=1))
    await login_as(client, u)
    assert (await _draw(client, g1.id)).json()["error"]["code"] == "gacha_closed"
    assert (await _draw(client, g2.id)).json()["error"]["code"] == "gacha_closed"
    assert await balance_of(u.id) == 10


async def test_multi_draw_flags(client):
    u = await create_user(balance=200)
    g = await create_gacha(allow_multi_100=False)
    await login_as(client, u)
    r = await _draw(client, g.id, 100)
    assert r.json()["error"]["code"] == "multi_not_allowed"


def test_probability_distribution_chi_square():
    """当選確率の検証：20 万回の抽選結果が設定確率に従うことをカイ二乗検定で確認（有意水準 0.1%）。"""
    weights = [7900, 1700, 350, 50]
    pool = [Pool(i, i, w, None) for i, w in enumerate(weights)]
    n = 200_000
    rng = random.Random(20261016)
    counts = Counter(pick(pool, "probability", rng).item_id for _ in range(n))
    total = sum(weights)
    chi2 = sum((counts[i] - n * w / total) ** 2 / (n * w / total) for i, w in enumerate(weights))
    assert chi2 < 16.27, chi2  # 自由度 3, p=0.001


def test_box_pick_proportional_to_remaining():
    pool = [Pool(0, 0, 0, 90), Pool(1, 1, 999, 10)]  # ボックスでは weight を無視
    rng = random.Random(1)
    counts = Counter(pick(pool, "box", rng).item_id for _ in range(100_000))
    assert abs(counts[1] / 100_000 - 0.10) < 0.005


async def test_actual_draw_distribution(client):
    """実際の抽選 API 経由でも提供割合どおりに出る（N 90% / SSR 10%、1000 回）。"""
    u = await create_user(balance=1000)
    g = await create_gacha(items=[("N", 90, None), ("SSR", 10, None)])
    await login_as(client, u)
    counts = Counter()
    for _ in range(10):
        counts.update((await _draw(client, g.id, 100)).json()["rarity_counts"])
    # 二項分布の 99.9% 区間（±約 31）
    assert 60 <= counts["SSR"] <= 140, counts


async def test_result_digest_detects_tampering(client, db_session):
    from app.models import DrawResult
    from app.services import draw_engine

    u = await create_user(balance=10)
    admin = await create_user(role="admin")
    g = await create_gacha(items=[("N", 1, None), ("SSR", 1, None)])
    await login_as(client, u)
    draw_id = (await _draw(client, g.id, 1)).json()["id"]
    async with db_session() as db:
        d = await draw_engine.load_draw(db, draw_id)
        assert draw_engine.verify_digest(d, d.results)
        r = (await db.execute(select(DrawResult).where(DrawResult.draw_id == d.id))).scalar_one()
        other = (await db.execute(select(GachaItem.prize_id).where(GachaItem.gacha_id == g.id, GachaItem.prize_id != r.prize_id))).scalar_one()
        r.prize_id = other  # DB を直接書き換える
        await db.commit()
    await login_as(client, admin)
    detail = (await client.get(f"/api/admin/draws/{draw_id}")).json()
    assert detail["digest_valid"] is False


async def test_draw_history_visible_only_to_owner(make_client):
    a, b = await create_user(balance=5), await create_user(balance=5)
    g = await create_gacha()
    ca, cb = await make_client(), await make_client()
    await login_as(ca, a)
    await login_as(cb, b)
    draw_id = (await _draw(ca, g.id)).json()["id"]
    assert (await ca.get(f"/api/draws/{draw_id}")).status_code == 200
    assert (await cb.get(f"/api/draws/{draw_id}")).status_code == 404
    assert (await ca.get("/api/draws")).json()["total"] == 1
    assert (await cb.get("/api/draws")).json()["total"] == 0


async def test_maintenance_mode_blocks_draws(make_client):
    admin, u = await create_user(role="admin"), await create_user(balance=5)
    g = await create_gacha()
    ac, uc = await make_client(), await make_client()
    await login_as(ac, admin)
    await login_as(uc, u)
    assert (await ac.put("/api/admin/settings", json={"maintenance_mode": True})).status_code == 200
    r = await _draw(uc, g.id)
    assert r.status_code == 503
    assert await balance_of(u.id) == 5


async def test_recent_wins_shows_only_rare_with_masked_names(client):
    from app.api import user as user_api

    user_api._recent_cache["at"] = 0.0
    u = await create_user(balance=20, name="星野ひかり")
    g = await create_gacha(items=[("N", 1, None), ("SSR", 1, 3)])
    await login_as(client, u)
    for _ in range(6):
        await _draw(client, g.id, 1)
    wins = (await client.get("/api/recent-wins")).json()
    assert 1 <= len(wins) <= 3  # SSR は在庫 3 個まで。N だけの抽選は表示されない
    assert all(w["rarity"] == "SSR" for w in wins)
    assert wins[0]["name"] == "星●●"  # ニックネームは伏せ字
    assert "email" not in wins[0] and "user_id" not in wins[0]
    assert wins[0]["gacha_slug"] == g.slug

    # 公開を終えたガチャの当選はリンク先を返さない（詳細ページは表示できないため）
    from app.core.db import SessionLocal
    from app.models import Gacha

    async with SessionLocal() as db:
        (await db.get(Gacha, g.id)).status = "archived"
        await db.commit()
    user_api._recent_cache["at"] = 0.0
    wins = (await client.get("/api/recent-wins")).json()
    assert wins and all(w["gacha_slug"] is None for w in wins)


async def test_sold_out_gachas_move_to_the_bottom(client):
    """完売したガチャは、管理画面の表示順に関わらず自動で一覧のいちばん下へ（お客さまのご要望）。"""
    from app.core import cache

    sold = await create_gacha(mode="box", items=[("N", 1, 0), ("SSR", 1, 0)], sort_order=0)
    open_ = await create_gacha(mode="box", items=[("N", 1, 5), ("SSR", 1, 1)], sort_order=5)
    cache.invalidate("gachas:list")
    slugs = [g["slug"] for g in (await client.get("/api/gachas")).json()]
    assert slugs.index(open_.slug) < slugs.index(sold.slug)
    assert slugs[-1] == sold.slug
