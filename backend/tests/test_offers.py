"""広告連携：正常な成果通知・不正な通知・重複通知・成果の照合・チケット付与の正確性。"""

import asyncio
import time
import uuid

from sqlalchemy import func, select

from app.models import Conversion, Offer, PostbackLog, TicketTransaction
from app.providers.hmac_generic import sign
from tests.conftest import balance_of, create_user, login_as

SECRET = "adnetwork-test-secret"


async def _offer(provider="adnetwork", reward=5, limit=1, kind="ad", is_test=False):
    from app.core.db import SessionLocal

    async with SessionLocal() as db:
        o = Offer(provider=provider, kind=kind, title="テスト案件", url_template="https://ads.example/?c={click_id}",
                  reward_tickets=reward, per_user_limit=limit, is_test=is_test)
        db.add(o)
        await db.commit()
        return o


async def _click(client, offer_id):
    r = await client.post(f"/api/offers/{offer_id}/start")
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://ads.example/?c=")
    return r.json()["click_id"]


def _params(click_id, conv_id=None, status="approved", ts=None, secret=SECRET):
    p = {"click_id": click_id, "conversion_id": conv_id or uuid.uuid4().hex, "status": status,
         "payout": "120", "ts": str(int(ts or time.time()))}
    p["sig"] = sign(p, secret)
    return p


async def test_valid_postback_credits_tickets(client, make_client, db_session):
    u = await create_user()
    await login_as(client, u)
    o = await _offer(reward=7)
    click = await _click(client, o.id)
    server = await make_client()  # 事業者サーバー（Cookie なし・CSRF 対象外）
    r = await server.http.get("/api/postbacks/adnetwork", params=_params(click))
    assert r.status_code == 200 and r.text == "OK"
    assert await balance_of(u.id) == 7
    async with db_session() as db:
        tx = (await db.execute(select(TicketTransaction).where(TicketTransaction.user_id == u.id))).scalar_one()
        assert tx.kind == "ad" and tx.delta == 7 and tx.is_test is False
        conv = (await db.execute(select(Conversion))).scalar_one()
        assert conv.status == "credited" and conv.ticket_transaction_id == tx.id
    offers = (await client.get("/api/offers")).json()
    assert next(x for x in offers if x["id"] == o.id)["earned_count"] == 1


async def test_postback_via_post_form(client, make_client):
    u = await create_user()
    await login_as(client, u)
    o = await _offer(reward=3, kind="survey")
    click = await _click(client, o.id)
    server = await make_client()
    r = await server.http.post("/api/postbacks/adnetwork", data=_params(click))
    assert r.status_code == 200
    assert await balance_of(u.id) == 3


async def test_bad_signature_rejected_and_logged(client, make_client, db_session):
    u = await create_user()
    await login_as(client, u)
    o = await _offer()
    click = await _click(client, o.id)
    server = await make_client()
    p = _params(click)
    p["status"] = "approved"
    p["payout"] = "999999"  # 署名後の改ざん
    r = await server.http.get("/api/postbacks/adnetwork", params=p)
    assert r.status_code == 403
    r = await server.http.get("/api/postbacks/adnetwork", params=_params(click, secret="wrong-secret"))
    assert r.status_code == 403
    assert await balance_of(u.id) == 0
    async with db_session() as db:
        outcomes = (await db.execute(select(PostbackLog.outcome))).scalars().all()
        assert outcomes.count("bad_signature") == 2
        assert await db.scalar(select(func.count()).select_from(Conversion)) == 0


async def test_stale_timestamp_rejected(client, make_client):
    u = await create_user()
    await login_as(client, u)
    click = await _click(client, (await _offer()).id)
    server = await make_client()
    r = await server.http.get("/api/postbacks/adnetwork", params=_params(click, ts=time.time() - 3600))
    assert r.status_code == 403
    assert await balance_of(u.id) == 0


async def test_duplicate_postback_credits_once(client, make_client, db_session):
    u = await create_user()
    await login_as(client, u)
    o = await _offer(reward=5, limit=10)
    click = await _click(client, o.id)
    server = await make_client()
    p = _params(click, conv_id="CONV-001")
    rs = await asyncio.gather(*[server.http.get("/api/postbacks/adnetwork", params=p) for _ in range(6)])
    assert all(r.status_code == 200 for r in rs)  # 事業者の再送を止めるため重複にも 200
    assert await balance_of(u.id) == 5
    async with db_session() as db:
        conv = (await db.execute(select(Conversion))).scalar_one()
        assert conv.duplicate_count == 5


async def test_unknown_click_rejected(make_client, db_session):
    server = await make_client()
    r = await server.http.get("/api/postbacks/adnetwork", params=_params(str(uuid.uuid4())))
    assert r.status_code == 200  # 受信はするが付与しない
    async with db_session() as db:
        conv = (await db.execute(select(Conversion))).scalar_one()
        assert conv.status == "rejected" and conv.reject_reason == "unknown_click"
        assert await db.scalar(select(func.count()).select_from(TicketTransaction)) == 0


async def test_provider_mismatch_rejected(client, make_client, db_session):
    """別事業者の案件の click_id を使った通知は照合に失敗する。"""
    import os

    os.environ["POSTBACK_SECRET_SURVEYHUB"] = "surveyhub-secret"
    u = await create_user()
    await login_as(client, u)
    click = await _click(client, (await _offer(provider="adnetwork")).id)
    server = await make_client()
    r = await server.http.get("/api/postbacks/surveyhub", params=_params(click, secret="surveyhub-secret"))
    assert r.status_code == 200
    assert await balance_of(u.id) == 0
    async with db_session() as db:
        assert (await db.execute(select(Conversion.reject_reason))).scalar_one() == "provider_mismatch"


async def test_provider_rejected_status_not_credited(client, make_client):
    u = await create_user()
    await login_as(client, u)
    click = await _click(client, (await _offer()).id)
    server = await make_client()
    await server.http.get("/api/postbacks/adnetwork", params=_params(click, status="rejected"))
    await server.http.get("/api/postbacks/adnetwork", params=_params(click, status="pending"))
    assert await balance_of(u.id) == 0


async def test_per_user_limit_enforced(client, make_client, db_session):
    u = await create_user()
    await login_as(client, u)
    o = await _offer(reward=4, limit=1)
    click = await _click(client, o.id)
    server = await make_client()
    await server.http.get("/api/postbacks/adnetwork", params=_params(click, conv_id="A"))
    await server.http.get("/api/postbacks/adnetwork", params=_params(click, conv_id="B"))
    assert await balance_of(u.id) == 4
    # 獲得済み案件には新たに遷移できない
    r = await client.post(f"/api/offers/{o.id}/start")
    assert r.status_code == 409


async def test_unknown_provider_404(make_client):
    server = await make_client()
    r = await server.http.get("/api/postbacks/nonexistent", params={"a": "b"})
    assert r.status_code == 404


async def test_mock_offer_is_marked_test(client, db_session):
    """開発用の模擬成果は is_test として本番成果と区別される。"""
    u = await create_user()
    await login_as(client, u)
    o = await _offer(provider="mock", reward=2, is_test=True, limit=3)
    click = await _click(client, o.id)
    r = await client.post(f"/api/offers/clicks/{click}/simulate")
    assert r.json()["outcome"] == "credited"
    assert await balance_of(u.id) == 2
    async with db_session() as db:
        tx = (await db.execute(select(TicketTransaction))).scalar_one()
        assert tx.is_test is True and "テスト" in tx.description
        assert (await db.execute(select(Conversion.is_test))).scalar_one() is True


async def test_mock_provider_disabled_in_production(monkeypatch, make_client):
    from app.core import config

    monkeypatch.setattr(config.settings, "env", "production")
    server = await make_client()
    r = await server.http.get("/api/postbacks/mock", params={"x": "y"})
    assert r.status_code == 404


async def test_mock_signature_cannot_credit_real_offer(client, make_client, db_session):
    """模擬事業者の署名で本番案件のチケットを得ることはできない。"""
    from app.providers.registry import mock_secret

    u = await create_user()
    await login_as(client, u)
    click = await _click(client, (await _offer(provider="adnetwork")).id)
    server = await make_client()
    await server.http.get("/api/postbacks/mock", params=_params(click, secret=mock_secret()))
    assert await balance_of(u.id) == 0


async def test_fluct_and_skyflag_postback_endpoints_are_ready(make_client, monkeypatch):
    """fluct・skyflag の成果通知の受け口は用意済み。署名鍵が未設定の間は付与しない（503）。設定すれば署名を検証して受け付ける。"""
    c = await make_client()
    for name in ("fluct", "skyflag"):
        monkeypatch.delenv(f"POSTBACK_SECRET_{name.upper()}", raising=False)
        r = await c.http.get(f"/api/postbacks/{name}", params={"click_id": "x", "conversion_id": "y", "status": "approved", "ts": "0", "sig": "z"})
        assert r.status_code == 503
        monkeypatch.setenv(f"POSTBACK_SECRET_{name.upper()}", "test-secret")
        r = await c.http.get(f"/api/postbacks/{name}", params={"click_id": "x", "conversion_id": "y", "status": "approved", "ts": "0", "sig": "bad"})
        assert r.status_code == 403  # 署名が違う通知は拒否
