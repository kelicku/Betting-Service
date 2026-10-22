"""景品交換：交換申請・二重申請防止・管理者承認・ステータス変更・個人情報保護。"""

import asyncio

from sqlalchemy import select

from app.models import AdminAuditLog, ExchangeRequest
from tests.conftest import create_gacha, create_user, key, login_as

SHIPPING = {
    "name": "星野 ひかり", "postal_code": "150-0001", "prefecture": "東京都",
    "address1": "渋谷区神宮前1-2-3", "address2": "星降るマンション101", "phone": "090-1234-5678", "note": "",
}


async def _setup(client, n=2):
    u = await create_user(balance=n)
    g = await create_gacha()
    await login_as(client, u)
    await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    if n > 1:
        await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    prizes = (await client.get("/api/prizes")).json()["items"]
    return u, [p["id"] for p in prizes]


async def _request(client, ids, k=None):
    return await client.post("/api/exchanges", json={
        "user_prize_ids": ids, "shipping": SHIPPING, "save_address": True, "idempotency_key": k or key(),
    })


async def test_exchange_request_and_status(client, db_session):
    u, ids = await _setup(client)
    r = await _request(client, ids)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending" and len(body["items"]) == 2
    assert body["recipient_masked"] == "星野 ●●"
    prizes = (await client.get("/api/prizes?status=exchange_pending")).json()
    assert prizes["total"] == 2
    # 配送先は暗号化して保存されている
    async with db_session() as db:
        req = await db.get(ExchangeRequest, body["id"])
        assert "星野" not in req.shipping_encrypted and "渋谷" not in req.shipping_encrypted
    # 保存した住所を次回呼び出せる
    saved = (await client.get("/api/shipping-address")).json()["address"]
    assert saved["address1"] == SHIPPING["address1"]


async def test_double_exchange_prevented(client):
    _, ids = await _setup(client)
    assert (await _request(client, ids[:1])).status_code == 201
    r = await _request(client, ids[:1])
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_requested"


async def test_concurrent_exchange_same_prize(client):
    _, ids = await _setup(client, n=1)
    rs = await asyncio.gather(*[_request(client, ids) for _ in range(6)])
    assert sum(r.status_code == 201 for r in rs) == 1


async def test_exchange_idempotent_retry(client):
    _, ids = await _setup(client)
    k = key()
    r1, r2 = await _request(client, ids, k), await _request(client, ids, k)
    assert r1.status_code == r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]


async def test_cannot_exchange_others_prize(make_client):
    a, b = await make_client(), await make_client()
    _, ids = await _setup(a)
    other = await create_user()
    await login_as(b, other)
    r = await _request(b, ids)
    assert r.status_code == 404


async def test_admin_workflow_and_invalid_transition(make_client, db_session):
    uc, ac = await make_client(), await make_client()
    _, ids = await _setup(uc)
    req_id = (await _request(uc, ids)).json()["id"]
    staff = await create_user(role="staff")
    await login_as(ac, staff)

    # 受付 → 発送済み は飛ばせない
    r = await ac.post(f"/api/admin/exchanges/{req_id}/status", json={"status": "shipped"})
    assert r.status_code == 409
    for st in ("approved", "preparing"):
        r = await ac.post(f"/api/admin/exchanges/{req_id}/status", json={"status": st})
        assert r.status_code == 200, r.text
    r = await ac.post(f"/api/admin/exchanges/{req_id}/status", json={"status": "shipped", "carrier": "ヤマト運輸", "tracking_number": "1234-5678-9012"})
    assert r.json()["status"] == "shipped"
    assert r.json()["shipping"]["name"] == "星野 ひかり"  # 管理者は復号済みの配送先を確認できる
    r = await ac.post(f"/api/admin/exchanges/{req_id}/status", json={"status": "completed"})
    assert r.json()["status"] == "completed"
    # ユーザー側：景品は交換済みになり、追跡番号を確認できる
    mine = (await uc.get(f"/api/exchanges/{req_id}")).json()
    assert mine["status"] == "completed" and mine["tracking_number"] == "1234-5678-9012"
    assert (await uc.get("/api/prizes?status=exchanged")).json()["total"] == 2
    # 個人情報の閲覧は監査ログに記録される
    async with db_session() as db:
        actions = (await db.execute(select(AdminAuditLog.action))).scalars().all()
        assert "exchange.view_pii" in actions and actions.count("exchange.status") == 4


async def test_reject_releases_prizes_for_reapply(make_client):
    uc, ac = await make_client(), await make_client()
    _, ids = await _setup(uc)
    req_id = (await _request(uc, ids)).json()["id"]
    await login_as(ac, await create_user(role="staff"))
    r = await ac.post(f"/api/admin/exchanges/{req_id}/status", json={"status": "rejected", "note": "住所不備のため"})
    assert r.status_code == 200
    assert (await uc.get("/api/prizes?status=owned")).json()["total"] == 2
    assert (await uc.get(f"/api/exchanges/{req_id}")).json()["admin_note"] == "住所不備のため"
    assert (await _request(uc, ids)).status_code == 201


async def test_user_cancel_only_while_pending(make_client):
    uc, ac = await make_client(), await make_client()
    _, ids = await _setup(uc)
    req_id = (await _request(uc, ids[:1])).json()["id"]
    r = await uc.post(f"/api/exchanges/{req_id}/cancel")
    assert r.json()["status"] == "cancelled"
    req2 = (await _request(uc, ids[:1])).json()["id"]
    await login_as(ac, await create_user(role="staff"))
    await ac.post(f"/api/admin/exchanges/{req2}/status", json={"status": "approved"})
    r = await uc.post(f"/api/exchanges/{req2}/cancel")
    assert r.status_code == 409


async def test_shipping_validation(client):
    _, ids = await _setup(client, n=1)
    bad = {**SHIPPING, "postal_code": "abc"}
    r = await client.post("/api/exchanges", json={"user_prize_ids": ids, "shipping": bad, "idempotency_key": key()})
    assert r.status_code == 422
    r = await client.post("/api/exchanges", json={"user_prize_ids": ids, "idempotency_key": key()})
    assert r.status_code == 400 and r.json()["error"]["code"] == "shipping_required"


async def test_pii_purge(make_client, db_session):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import update

    from app.services.exchange import purge_expired_pii

    uc, ac = await make_client(), await make_client()
    _, ids = await _setup(uc, n=1)
    req_id = (await _request(uc, ids)).json()["id"]
    await login_as(ac, await create_user(role="staff"))
    await ac.post(f"/api/admin/exchanges/{req_id}/status", json={"status": "rejected", "note": "x"})
    async with db_session() as db:
        await db.execute(update(ExchangeRequest).values(updated_at=datetime.now(UTC) - timedelta(days=200)))
        await db.commit()
        assert await purge_expired_pii(db) == 1
        req = await db.get(ExchangeRequest, req_id)
        assert req.shipping_encrypted is None and req.pii_purged_at is not None
