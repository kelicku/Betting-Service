"""チケット付与（ログインボーナス・ミッション・管理者）と管理機能。"""

import asyncio

from sqlalchemy import func, select

from app.models import AdminAuditLog, TicketTransaction
from tests.conftest import balance_of, create_gacha, create_user, key, login_as


async def test_daily_bonus_once_per_day(client):
    u = await create_user()
    await login_as(client, u)
    rs = await asyncio.gather(*[client.post("/api/rewards/daily") for _ in range(5)])
    assert sum(r.status_code == 200 for r in rs) == 1
    assert sum(r.status_code == 409 for r in rs) == 4
    assert await balance_of(u.id) == 1
    status = (await client.get("/api/rewards/daily")).json()
    assert status["claimed_today"] is True and status["streak"] == 1


async def test_mission_claim_requires_condition_and_once(client):
    from app.core.db import SessionLocal
    from app.models import Mission

    async with SessionLocal() as db:
        m = Mission(code="d10", kind="achievement", title="10回", reward_tickets=5, condition_type="total_draws", condition_value=10)
        db.add(m)
        await db.commit()
    u = await create_user(balance=10)
    g = await create_gacha()
    await login_as(client, u)
    assert (await client.post(f"/api/missions/{m.id}/claim")).status_code == 400
    await client.post(f"/api/gachas/{g.id}/draw", json={"count": 10, "idempotency_key": key()})
    ms = (await client.get("/api/missions")).json()
    assert ms[0]["claimable"] is True and ms[0]["progress"] == 10
    rs = await asyncio.gather(*[client.post(f"/api/missions/{m.id}/claim") for _ in range(4)])
    assert sum(r.status_code == 200 for r in rs) == 1
    assert await balance_of(u.id) == 5


async def test_admin_ticket_grant_idempotent_and_audited(make_client, db_session):
    admin, u = await create_user(role="admin"), await create_user()
    ac = await make_client()
    await login_as(ac, admin)
    k = key()
    body = {"delta": 50, "reason": "お詫び補填", "idempotency_key": k}
    r1 = await ac.post(f"/api/admin/users/{u.id}/tickets", json=body)
    r2 = await ac.post(f"/api/admin/users/{u.id}/tickets", json=body)
    assert r1.json()["duplicate"] is False and r2.json()["duplicate"] is True
    assert await balance_of(u.id) == 50
    r = await ac.post(f"/api/admin/users/{u.id}/tickets", json={"delta": -80, "reason": "誤付与の取消", "idempotency_key": key()})
    assert r.status_code == 400 and r.json()["error"]["code"] == "negative_balance"
    r = await ac.post(f"/api/admin/users/{u.id}/tickets", json={"delta": -20, "reason": "誤付与の取消", "idempotency_key": key()})
    assert r.json()["balance"] == 30
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(AdminAuditLog).where(AdminAuditLog.action == "tickets.adjust")) == 2
        txs = (await db.execute(select(TicketTransaction).where(TicketTransaction.user_id == u.id))).scalars().all()
        assert all(t.actor_id == admin.id for t in txs)


async def test_ticket_history_for_user(client):
    u = await create_user(balance=5)
    g = await create_gacha()
    await login_as(client, u)
    await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    all_ = (await client.get("/api/tickets/transactions")).json()
    assert all_["total"] == 2
    assert (await client.get("/api/tickets/transactions?direction=spend")).json()["total"] == 1
    w = (await client.get("/api/tickets/wallet")).json()
    assert w == {"balance": 4, "total_earned": 5, "total_spent": 1}


async def test_admin_gacha_lifecycle(make_client):
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    p1 = (await ac.post("/api/admin/prizes", json={"name": "宝石", "rarity": "SR"})).json()
    p2 = (await ac.post("/api/admin/prizes", json={"name": "石", "rarity": "N"})).json()
    g = (await ac.post("/api/admin/gachas", json={"slug": "new-box", "title": "新ボックス", "ticket_cost": 2, "mode": "box",
                                                   "last_one_prize_id": p1["id"]})).json()
    assert g["status"] == "draft"
    # 景品なしでは公開できない
    assert (await ac.post(f"/api/admin/gachas/{g['id']}/status", json={"status": "published"})).status_code == 400
    # ボックス方式は在庫必須
    r = await ac.put(f"/api/admin/gachas/{g['id']}/items", json={"items": [{"prize_id": p2["id"], "weight": 1}]})
    assert r.status_code == 400
    r = await ac.put(f"/api/admin/gachas/{g['id']}/items", json={"items": [
        {"prize_id": p1["id"], "stock_total": 1}, {"prize_id": p2["id"], "stock_total": 9}]})
    assert r.json()["remaining"] == 10
    assert (await ac.post(f"/api/admin/gachas/{g['id']}/status", json={"status": "published"})).json()["status"] == "published"

    # 抽選後は在庫数の直接変更不可・在庫調整 API を使う
    u = await create_user(balance=10)
    uc = await make_client()
    await login_as(uc, u)
    assert (await uc.post(f"/api/gachas/{g['id']}/draw", json={"count": 1, "idempotency_key": key()})).status_code == 200
    r = await ac.put(f"/api/admin/gachas/{g['id']}/items", json={"items": [
        {"prize_id": p1["id"], "stock_total": 5}, {"prize_id": p2["id"], "stock_total": 9}]})
    assert r.status_code == 409
    item = next(i for i in (await ac.get(f"/api/admin/gachas/{g['id']}")).json()["items"] if i["prize_id"] == p2["id"])
    r = await ac.post(f"/api/admin/gachas/{g['id']}/stock", json={"item_id": item["id"], "delta": 5, "reason": "追加入荷"})
    assert r.json()["remaining"] == 14
    # 抽選方式は変更不可
    r = await ac.put(f"/api/admin/gachas/{g['id']}", json={"slug": "new-box", "title": "x", "ticket_cost": 2, "mode": "probability"})
    assert r.status_code == 409


async def test_probability_last_one_requires_max_pulls(make_client):
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    p = (await ac.post("/api/admin/prizes", json={"name": "宝石", "rarity": "SSR"})).json()
    r = await ac.post("/api/admin/gachas", json={"slug": "p-lo", "title": "x", "ticket_cost": 1, "mode": "probability", "last_one_prize_id": p["id"]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "last_one_needs_limit"


async def test_admin_stats_and_lists(make_client):
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    s = (await ac.get("/api/admin/stats")).json()
    assert s["users_total"] == 1 and len(s["series"]) == 14
    for path in ("/api/admin/users", "/api/admin/draws", "/api/admin/exchanges", "/api/admin/offers", "/api/admin/conversions",
                 "/api/admin/audit-logs", "/api/admin/settings", "/api/admin/inventory", "/api/admin/missions",
                 "/api/admin/last-one-awards", "/api/admin/tickets/transactions", "/api/admin/postback-logs", "/api/admin/contacts"):
        assert (await ac.get(path)).status_code == 200, path


async def test_settings_change_is_audited(make_client, db_session):
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    r = await ac.put("/api/admin/settings", json={"signup_bonus_tickets": 20})
    assert r.json()["values"]["signup_bonus_tickets"] == 20
    r = await ac.put("/api/admin/settings", json={"signup_bonus_tickets": -1})
    assert r.status_code == 400
    async with db_session() as db:
        log = (await db.execute(select(AdminAuditLog).where(AdminAuditLog.action == "settings.update"))).scalar_one()
        assert log.detail == {"signup_bonus_tickets": {"from": 10, "to": 20}}


async def test_xss_payload_stored_as_text(client):
    """入力は HTML として解釈されず文字列として保存・返却される（表示側は React が自動エスケープ）。"""
    u = await create_user()
    await login_as(client, u)
    r = await client.patch("/api/auth/me", json={"display_name": "<script>x</script>"})
    assert r.json()["display_name"] == "<script>x</script>"


async def test_sql_injection_in_search_is_harmless(make_client):
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    r = await ac.get("/api/admin/users", params={"q": "' OR 1=1; DROP TABLE users; --"})
    assert r.status_code == 200 and r.json()["total"] == 0
    assert (await ac.get("/api/admin/users")).json()["total"] == 1
