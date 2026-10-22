"""ラストワン賞：最終口の判定・同時抽選・重複付与防止・まとめ引き中の判定。"""

import asyncio

from sqlalchemy import func, select

from app.models import LastOneAward, UserPrize
from tests.conftest import create_gacha, create_user, key, login_as


async def _draw(client, gid, count=1):
    return await client.post(f"/api/gachas/{gid}/draw", json={"count": count, "idempotency_key": key()})


async def test_last_pull_awards_last_one(client, db_session):
    u = await create_user(balance=10)
    g = await create_gacha(mode="box", items=[("N", 0, 3)], last_one=True)
    await login_as(client, u)
    r1 = (await _draw(client, g.id)).json()
    assert r1["has_last_one"] is False
    await _draw(client, g.id)
    r3 = (await _draw(client, g.id)).json()
    assert r3["has_last_one"] is True
    assert len(r3["results"]) == 2  # 通常の 1 口 + ラストワン賞
    assert r3["results"][-1]["is_last_one"] is True
    assert r3["results"][-1]["prize"]["name"] == "ラストワン"
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(LastOneAward)) == 1
        assert await db.scalar(select(func.count()).select_from(UserPrize).where(UserPrize.source == "last_one")) == 1
    detail = (await client.get(f"/api/gachas/{g.slug}")).json()
    assert detail["last_one_awarded"] is True and detail["remaining"] == 0


async def test_last_one_in_multi_draw(client):
    """10 回まとめ引きの中で最後の 1 口が消費された場合もラストワン賞が付与される。"""
    u = await create_user(balance=20)
    g = await create_gacha(mode="box", items=[("N", 0, 7), ("R", 0, 3)], last_one=True)
    await login_as(client, u)
    r = (await _draw(client, g.id, 10)).json()
    assert r["has_last_one"] is True
    assert len(r["results"]) == 11
    assert [x["is_last_one"] for x in r["results"]].count(True) == 1
    assert r["rarity_counts"] == {"N": 7, "R": 3, "SR": 0, "SSR": 0}


async def test_multi_draw_not_covering_last_does_not_award(client):
    u = await create_user(balance=20)
    g = await create_gacha(mode="box", items=[("N", 0, 11)], last_one=True)
    await login_as(client, u)
    r = (await _draw(client, g.id, 10)).json()
    assert r["has_last_one"] is False
    r = (await _draw(client, g.id, 1)).json()
    assert r["has_last_one"] is True


async def test_last_one_with_probability_max_pulls(client):
    u = await create_user(balance=20)
    g = await create_gacha(max_pulls=10, last_one=True)
    await login_as(client, u)
    r = (await _draw(client, g.id, 10)).json()
    assert r["has_last_one"] is True
    r = await _draw(client, g.id, 1)
    assert r.json()["error"]["code"] == "sold_out"


async def test_concurrent_last_one_awarded_exactly_once(make_client, db_session):
    """残り 5 口に 15 人が同時に引いても、成功は 5 回・ラストワン賞は 1 件だけ。"""
    g = await create_gacha(mode="box", items=[("N", 0, 5)], last_one=True)
    clients = []
    for _ in range(15):
        u = await create_user(balance=3)
        c = await make_client()
        await login_as(c, u)
        clients.append(c)
    rs = await asyncio.gather(*[_draw(c, g.id) for c in clients])
    ok = [r.json() for r in rs if r.status_code == 200]
    assert len(ok) == 5
    assert sum(1 for r in ok if r["has_last_one"]) == 1
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(LastOneAward)) == 1
        assert await db.scalar(select(func.count()).select_from(UserPrize).where(UserPrize.source == "last_one")) == 1


async def test_concurrent_multi_draws_with_last_one(make_client, db_session):
    """残り 25 口に 10 回引きが同時に 5 件：成功 2 件、残り 5 口に対し後続は全体不実行、ラストワン賞は未付与。
    最後に 5 回分を 1 回ずつ引き切るとラストワン賞が 1 件付与される。"""
    g = await create_gacha(mode="box", items=[("N", 0, 25)], last_one=True)
    clients = []
    for _ in range(5):
        u = await create_user(balance=30)
        c = await make_client()
        await login_as(c, u)
        clients.append(c)
    rs = await asyncio.gather(*[_draw(c, g.id, 10) for c in clients])
    assert sum(r.status_code == 200 for r in rs) == 2
    assert all(r.json()["error"]["code"] == "not_enough_remaining" for r in rs if r.status_code != 200)
    rs = await asyncio.gather(*[_draw(c, g.id, 1) for c in clients for _ in range(2)])
    assert sum(r.status_code == 200 for r in rs) == 5
    assert sum(1 for r in rs if r.status_code == 200 and r.json()["has_last_one"]) == 1
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(LastOneAward)) == 1


async def test_last_one_not_awarded_twice_after_restock(client, db_session):
    """ラストワン賞の付与後に運営が在庫を追加しても、次に完売したときに 2 回目のラストワン賞は付与せず、抽選は成功する。"""
    from sqlalchemy import func, select, update

    from app.models import GachaItem, LastOneAward
    from tests.conftest import create_gacha, create_user, key, login_as

    u = await create_user(balance=10)
    await login_as(client, u)
    g = await create_gacha(mode="box", items=[("N", 0, 2)], last_one=True)
    r = await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    r = await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    assert r.json()["has_last_one"] is True
    async with db_session() as db:
        await db.execute(update(GachaItem).where(GachaItem.gacha_id == g.id).values(stock_total=4, stock_remaining=2))
        await db.commit()
    r = await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    r = await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    assert r.status_code == 200 and r.json()["has_last_one"] is False
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(LastOneAward).where(LastOneAward.gacha_id == g.id)) == 1
