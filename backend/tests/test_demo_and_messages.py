"""デモ用ワンクリックログインと、運営から会員へのメッセージ配信。"""

import asyncio

from sqlalchemy import func, select

from app.core import mail
from app.models import AdminAuditLog, AdminMessage, Notification
from tests.conftest import balance_of, create_user, login_as

# ── ワンクリックログイン ───────────────────────────────────


async def test_demo_login_creates_separate_accounts(make_client, monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "demo_login_enabled", True)
    c1, c2 = await make_client(), await make_client()
    r1 = await c1.post("/api/auth/demo-login")
    r2 = await c2.post("/api/auth/demo-login")
    assert r1.status_code == r2.status_code == 200
    me1, me2 = r1.json(), r2.json()
    assert me1["id"] != me2["id"]  # 閲覧者ごとに別アカウント（残高・景品が混ざらない）
    assert me1["email_verified"] is True and me1["balance"] == 30
    assert (await c1.get("/api/auth/me")).json()["id"] == me1["id"]
    assert (await c1.get("/api/config")).json()["demo_login"] is True


async def test_demo_login_disabled_by_default_and_in_production(client, monkeypatch):
    from app.core import config

    assert (await client.post("/api/auth/demo-login")).status_code == 404
    monkeypatch.setattr(config.settings, "demo_login_enabled", True)
    monkeypatch.setattr(config.settings, "env", "production")
    assert (await client.post("/api/auth/demo-login")).status_code == 404
    assert (await client.get("/api/config")).json()["demo_login"] is False


async def test_demo_account_can_draw(client, monkeypatch):
    from app.core import config
    from tests.conftest import create_gacha, key

    monkeypatch.setattr(config.settings, "demo_login_enabled", True)
    me = (await client.post("/api/auth/demo-login")).json()
    g = await create_gacha()
    r = await client.post(f"/api/gachas/{g.id}/draw", json={"count": 10, "idempotency_key": key()})
    assert r.status_code == 200
    assert await balance_of(me["id"]) == 20  # 30 枚 − 10 回 × 1 枚


# ── メッセージ配信 ─────────────────────────────────────


async def _admin(make_client, role="admin"):
    c = await make_client()
    await login_as(c, await create_user(role=role))
    return c


async def test_send_message_to_specific_user(make_client, db_session):
    ac = await _admin(make_client)
    u, other = await create_user(), await create_user()
    body = {"target_type": "users", "user_ids": [u.id], "title": "配送についてのご連絡", "body": "お届け先をご確認ください。", "link": "/exchanges", "send_email": True}
    r = await ac.post("/api/admin/messages", json=body)
    assert r.status_code == 201, r.text
    assert r.json() == {"id": r.json()["id"], "recipient_count": 1, "email_count": 1}
    await asyncio.sleep(0.05)  # メールはレスポンス後に送信される
    assert [m.to for m in mail.outbox] == [u.email]
    assert "お届け先をご確認ください。" in mail.outbox[0].body

    uc = await make_client()
    await login_as(uc, u)
    items = (await uc.get("/api/notifications")).json()["items"]
    assert items[0]["kind"] == "message" and items[0]["title"] == "配送についてのご連絡" and items[0]["link"] == "/exchanges"
    assert (await uc.get("/api/auth/me")).json()["unread_notifications"] == 1
    oc = await make_client()
    await login_as(oc, other)
    assert (await oc.get("/api/notifications")).json()["total"] == 0
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(AdminAuditLog).where(AdminAuditLog.action == "message.send")) == 1


async def test_broadcast_skips_suspended_and_emails_verified_only(make_client, db_session):
    from sqlalchemy import update

    from app.models import User

    ac = await _admin(make_client)
    await create_user(verified=True)
    await create_user(verified=False)
    s = await create_user()
    async with db_session() as db:
        await db.execute(update(User).where(User.id == s.id).values(status="suspended"))
        await db.commit()
    # 送信前に人数を確認できる（管理者 1 + 有効 2 = 3 名、メールは確認済みの 2 名）
    pre = (await ac.get("/api/admin/messages/recipients?target_type=all")).json()
    assert pre == {"count": 3, "email_count": 2}
    assert (await ac.get("/api/admin/messages/recipients?target_type=verified")).json()["count"] == 2
    r = await ac.post("/api/admin/messages", json={"target_type": "all", "title": "メンテナンスのお知らせ", "body": "明日2時から停止します。", "send_email": True})
    assert r.json()["recipient_count"] == 3 and r.json()["email_count"] == 2
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == s.id)) == 0
        msg = (await db.execute(select(AdminMessage))).scalar_one()
        assert msg.target_type == "all" and msg.recipient_count == 3
    history = (await ac.get("/api/admin/messages")).json()
    assert history["total"] == 1 and history["items"][0]["target_label"] == "全会員"


async def test_demo_accounts_do_not_receive_email(make_client, monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "demo_login_enabled", True)
    gc = await make_client()
    await gc.post("/api/auth/demo-login")
    ac = await _admin(make_client)
    r = await ac.post("/api/admin/messages", json={"target_type": "all", "title": "t", "body": "b", "send_email": True})
    assert r.json()["recipient_count"] == 2 and r.json()["email_count"] == 1  # お試しアカウントはサイト内通知のみ


async def test_staff_can_message_individuals_but_not_broadcast(make_client):
    sc = await _admin(make_client, role="staff")
    u = await create_user()
    r = await sc.post("/api/admin/messages", json={"target_type": "users", "user_ids": [u.id], "title": "t", "body": "b"})
    assert r.status_code == 201
    r = await sc.post("/api/admin/messages", json={"target_type": "all", "title": "t", "body": "b"})
    assert r.status_code == 403


async def test_message_validation(make_client):
    ac = await _admin(make_client)
    base = {"target_type": "users", "title": "t", "body": "b"}
    assert (await ac.post("/api/admin/messages", json={**base, "user_ids": []})).status_code == 400
    assert (await ac.post("/api/admin/messages", json={**base, "user_ids": [999999]})).status_code == 400
    assert (await ac.post("/api/admin/messages", json={**base, "user_ids": [1], "link": "https://evil.example"})).status_code == 422
    uc = await make_client()
    await login_as(uc, await create_user())
    assert (await uc.post("/api/admin/messages", json={**base, "user_ids": [1]})).status_code == 403
