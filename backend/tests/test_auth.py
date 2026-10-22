"""会員機能：新規登録・メール認証・ログイン・ログアウト・パスワード再設定・不正アクセス防止。"""

import re

from app.core import mail
from tests.conftest import balance_of, create_user, login_as


def _token_from_outbox() -> str:
    m = re.search(r"token=([A-Za-z0-9_\-]+)", mail.outbox[-1].body)
    assert m
    return m.group(1)


async def test_register_verify_and_signup_bonus(client):
    r = await client.post("/api/auth/register", json={
        "email": "Hoshi@Example.com", "password": "starry123", "display_name": "星野", "agree_terms": True,
    })
    assert r.status_code == 202
    assert "確認メール" in r.json()["message"]
    assert mail.outbox[-1].to == "hoshi@example.com"

    token = _token_from_outbox()
    r = await client.post("/api/auth/verify-email", json={"token": token})
    assert r.status_code == 200
    me = r.json()
    assert me["email_verified"] is True
    assert me["balance"] == 10  # 新規登録特典

    # 同じトークンはもう使えず（確認済みと案内）、特典も重複しない
    r = await client.post("/api/auth/verify-email", json={"token": token})
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_verified"
    assert await balance_of(me["id"]) == 10


async def test_register_does_not_reveal_existing_email(client):
    await create_user(email="taken@example.com")
    r = await client.post("/api/auth/register", json={
        "email": "taken@example.com", "password": "starry123", "display_name": "x", "agree_terms": True,
    })
    assert r.status_code == 202
    assert "既に登録されています" in mail.outbox[-1].body


async def test_register_requires_terms_and_strong_password(client):
    r = await client.post("/api/auth/register", json={"email": "a@example.com", "password": "starry123", "display_name": "x", "agree_terms": False})
    assert r.status_code == 400
    r = await client.post("/api/auth/register", json={"email": "a@example.com", "password": "onlyletters", "display_name": "x", "agree_terms": True})
    assert r.status_code == 400 and r.json()["error"]["code"] == "weak_password"


async def test_login_logout(client):
    u = await create_user(password="password123")
    me = await login_as(client, u)
    assert me["email"] == u.email
    assert (await client.get("/api/auth/me")).status_code == 200
    r = await client.post("/api/auth/logout")
    assert r.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_login_wrong_password_generic_error(client):
    u = await create_user()
    r = await client.post("/api/auth/login", json={"email": u.email, "password": "wrong-pass1"})
    assert r.status_code == 401
    r2 = await client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-pass1"})
    assert r2.status_code == 401
    assert r.json()["error"]["message"] == r2.json()["error"]["message"]


async def test_login_lockout_after_failures(client):
    u = await create_user()
    for _ in range(5):
        await client.post("/api/auth/login", json={"email": u.email, "password": "wrong-pass1"})
    r = await client.post("/api/auth/login", json={"email": u.email, "password": "password123"})
    assert r.status_code == 423


async def test_suspended_user_cannot_login_and_session_is_revoked(make_client):
    admin = await create_user(role="admin")
    u = await create_user()
    uc, ac = await make_client(), await make_client()
    await login_as(uc, u)
    await login_as(ac, admin)
    r = await ac.post(f"/api/admin/users/{u.id}/suspend", json={"reason": "規約違反"})
    assert r.status_code == 200
    assert (await uc.get("/api/auth/me")).status_code == 401
    r = await uc.post("/api/auth/login", json={"email": u.email, "password": "password123"})
    assert r.status_code == 403


async def test_password_reset_flow(make_client):
    u = await create_user(password="oldpass123")
    c1, c2 = await make_client(), await make_client()
    await login_as(c1, u, "oldpass123")

    r = await c2.post("/api/auth/forgot-password", json={"email": u.email})
    assert r.status_code == 200
    token = _token_from_outbox()
    r = await c2.post("/api/auth/reset-password", json={"token": token, "password": "newpass456"})
    assert r.status_code == 200

    # 既存セッションは無効化、旧パスワードは使えない
    assert (await c1.get("/api/auth/me")).status_code == 401
    assert (await c2.post("/api/auth/login", json={"email": u.email, "password": "oldpass123"})).status_code == 401
    await login_as(c2, u, "newpass456")
    # トークンは使い捨て
    r = await c2.post("/api/auth/reset-password", json={"token": token, "password": "another789"})
    assert r.status_code == 400


async def test_forgot_password_unknown_email_same_response(client):
    r = await client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r.status_code == 200
    assert mail.outbox == []


async def test_csrf_required_for_state_changes(client):
    u = await create_user()
    await login_as(client, u)
    r = await client.http.post("/api/auth/logout")  # ヘッダーなし
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf"
    r = await client.http.post("/api/auth/logout", headers={"X-CSRF-Token": "forged"})
    assert r.status_code == 403
    r = await client.post("/api/auth/logout", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


async def test_admin_api_requires_role(make_client):
    u = await create_user()
    staff = await create_user(role="staff")
    c, s, anon = await make_client(), await make_client(), await make_client()
    await login_as(c, u)
    await login_as(s, staff)
    assert (await anon.get("/api/admin/users")).status_code == 401
    assert (await c.get("/api/admin/users")).status_code == 403
    assert (await s.get("/api/admin/users")).status_code == 200
    # スタッフはチケット付与（管理者専用）を実行できない
    r = await s.post(f"/api/admin/users/{u.id}/tickets", json={"delta": 100, "reason": "不正", "idempotency_key": "abcdefgh"})
    assert r.status_code == 403


async def test_unverified_user_cannot_draw(client):
    from tests.conftest import create_gacha, key

    u = await create_user(verified=False, balance=10)
    g = await create_gacha()
    await login_as(client, u)
    r = await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    assert r.status_code == 403 and r.json()["error"]["code"] == "email_not_verified"
    assert await balance_of(u.id) == 10


async def test_change_password_revokes_other_sessions(make_client):
    u = await create_user()
    c1, c2 = await make_client(), await make_client()
    await login_as(c1, u)
    await login_as(c2, u)
    r = await c1.post("/api/auth/change-password", json={"current_password": "password123", "new_password": "brandnew99"})
    assert r.status_code == 200
    assert (await c1.get("/api/auth/me")).status_code == 200
    assert (await c2.get("/api/auth/me")).status_code == 401


async def test_rate_limit_login(client, monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "rate_limit_enabled", True)
    codes = []
    for _ in range(12):
        r = await client.post("/api/auth/login", json={"email": "x@example.com", "password": "whatever1"})
        codes.append(r.status_code)
    assert 429 in codes


async def test_allowed_origins_setting(client, monkeypatch):
    """デモ用 URL など、追加で許可したアクセス元からは操作でき、それ以外は詳細なメッセージで拒否される。"""
    from app.core import config

    monkeypatch.setattr(config.settings, "allowed_origins", ["https://demo.example.com"])
    body = {"email": "x@example.com", "password": "starry123", "display_name": "x", "agree_terms": True}
    r = await client.post("/api/auth/register", json=body, headers={"Origin": "https://demo.example.com"})
    assert r.status_code == 202
    r = await client.post("/api/auth/register", json=body, headers={"Origin": "https://other.example.com"})
    assert r.status_code == 403
    err = r.json()["error"]
    assert err["code"] == "origin_not_allowed" and "https://other.example.com" in err["message"]


async def test_reopening_used_verification_link_says_already_verified(client):
    """確認済みのリンクをもう一度開いても「無効」ではなく「確認済み」と案内し、ログインはさせない。"""
    r = await client.post("/api/auth/register", json={"email": "twice@example.com", "password": "password123", "display_name": "二回", "agree_terms": True})
    assert r.status_code == 202
    token = _token_from_outbox()
    assert (await client.post("/api/auth/verify-email", json={"token": token})).status_code == 200
    other = client.http.__class__(transport=client.http._transport, base_url="http://testserver")
    from tests.conftest import Client

    c2 = Client(other)
    r = await c2.post("/api/auth/verify-email", json={"token": token})
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_verified"
    assert (await c2.get("/api/auth/me")).status_code == 401  # 使用済みのリンクではログインしない
    await other.aclose()


async def test_admin_can_resend_and_manually_verify(make_client):
    from app.core import mail
    from tests.conftest import balance_of, create_user, login_as

    admin = await create_user(role="admin")
    u = await create_user(verified=False)
    ac = await make_client()
    await login_as(ac, admin)
    r = await ac.post(f"/api/admin/users/{u.id}/resend-verification")
    assert r.status_code == 200 and mail.outbox[-1].to == u.email
    r = await ac.post(f"/api/admin/users/{u.id}/verify-email")
    assert r.status_code == 200 and r.json()["email_verified_at"] is not None
    assert await balance_of(u.id) == 10  # 新規登録特典（既定 10 枚）も通常どおり
    assert (await ac.post(f"/api/admin/users/{u.id}/verify-email")).json()["error"]["code"] == "already_verified"
