"""複数アカウント対策（お客さまのご提案）：同じ IP アドレスからの動画視聴の 1 日の合計上限、
同じ IP アドレスからの新規登録の上限、管理画面での「同じ IP アドレスの会員」の確認。
テストのクライアントはすべて同じ IP アドレス（127.0.0.1）からのアクセスになる。"""

from sqlalchemy import select

from app.models import Conversion, User
from tests.conftest import balance_of, create_user, login_as
from tests.test_phase2 import _params, set_setting


async def _video_offer():
    from app.core.db import SessionLocal
    from app.models import Offer

    async with SessionLocal() as db:
        o = Offer(provider="adnetwork", kind="video", title="動画", url_template="https://ads.example/?c={click_id}", reward_tickets=3, per_user_limit=1)
        db.add(o)
        await db.commit()
        return o


async def test_video_views_are_limited_per_ip_across_accounts(make_client, db_session):
    await set_setting(video_daily_limit=3, video_ip_daily_limit=4)
    o = await _video_offer()
    server = await make_client()
    a, b = await create_user(), await create_user()
    ca, cb = await make_client(), await make_client()
    await login_as(ca, a)
    await login_as(cb, b)
    for _ in range(3):
        r = await ca.post(f"/api/offers/{o.id}/start")
        assert r.status_code == 200, r.text
        assert (await server.http.get("/api/postbacks/adnetwork", params=_params(r.json()["click_id"]))).status_code == 200
    assert await balance_of(a.id) == 9
    # 別のアカウントでも、同じ IP からは合計 4 回まで
    r = await cb.post(f"/api/offers/{o.id}/start")
    assert r.status_code == 200
    first_b = r.json()["click_id"]
    assert (await server.http.get("/api/postbacks/adnetwork", params=_params(first_b))).status_code == 200
    assert await balance_of(b.id) == 3
    r = await cb.post(f"/api/offers/{o.id}/start")
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "video_ip_daily_limit" and "同じネットワーク" in err["message"] and "4 回" in err["message"]
    v = next(x for x in (await cb.get("/api/offers")).json() if x["id"] == o.id)
    assert v["ip_limit_reached"] is True and v["daily_used"] == 1  # 画面ではボタンを押せない状態で表示する
    # 画面を通さずに通知が届いても、IP の上限を超えた分は付与しない
    r = await server.http.get("/api/postbacks/adnetwork", params=_params(first_b))
    assert r.status_code == 200 and await balance_of(b.id) == 3
    async with db_session() as db:
        reasons = (await db.execute(select(Conversion.reject_reason).where(Conversion.status == "rejected"))).scalars().all()
        assert reasons == ["ip_daily_limit"]


async def test_video_ip_limit_zero_disables_it(make_client):
    await set_setting(video_daily_limit=5, video_ip_daily_limit=0)
    o = await _video_offer()
    server = await make_client()
    for _ in range(2):
        u = await create_user()
        c = await make_client()
        await login_as(c, u)
        for _ in range(3):
            r = await c.post(f"/api/offers/{o.id}/start")
            assert r.status_code == 200, r.text
            await server.http.get("/api/postbacks/adnetwork", params=_params(r.json()["click_id"]))
        assert await balance_of(u.id) == 9


def _reg(email):
    return {"email": email, "password": "starry123", "display_name": "複垢", "agree_terms": True}


async def test_register_limited_per_ip_per_day(client, monkeypatch, db_session):
    from app.core import config

    monkeypatch.setattr(config.settings, "rate_limit_enabled", True)
    await set_setting(register_ip_daily_limit=2)
    taken = await create_user(email="taken-ip@example.com")
    assert taken.id
    for i in range(2):
        assert (await client.post("/api/auth/register", json=_reg(f"ip{i}@example.com"))).status_code == 202
    r = await client.post("/api/auth/register", json=_reg("ip3@example.com"))
    assert r.status_code == 429 and r.json()["error"]["code"] == "register_ip_limit"
    # 登録済みのアドレスでも同じ応答（アドレスの登録有無を推測させない）
    r = await client.post("/api/auth/register", json=_reg("taken-ip@example.com"))
    assert r.status_code == 429 and r.json()["error"]["code"] == "register_ip_limit"
    async with db_session() as db:
        ips = (await db.execute(select(User.signup_ip).where(User.email.like("ip%@example.com")))).scalars().all()
        assert len(ips) == 2 and all(ips)
    # 0 にすると制限しない
    await set_setting(register_ip_daily_limit=0)
    assert (await client.post("/api/auth/register", json=_reg("ip4@example.com"))).status_code == 202


async def test_admin_sees_accounts_sharing_an_ip(make_client):
    admin = await create_user(role="admin")
    a, b = await create_user(name="本垢"), await create_user(name="サブ垢")
    for u in (a, b):
        await login_as(await make_client(), u)
    ac = await make_client()
    await login_as(ac, admin)
    r = await ac.get(f"/api/admin/users/{a.id}/same-ip")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ips"], "ログイン時の IP が記録されていない"
    ids = {x["id"] for x in body["items"]}
    assert b.id in ids and a.id not in ids
    hit = next(x for x in body["items"] if x["id"] == b.id)
    assert hit["shared_ips"] == body["ips"][:1] or set(hit["shared_ips"]) <= set(body["ips"])
    # 一般会員は使えない
    uc = await make_client()
    await login_as(uc, await create_user())
    assert (await uc.get(f"/api/admin/users/{a.id}/same-ip")).status_code == 403


def test_net_key_groups_ipv6_by_64():
    from app.core.netkey import net_key

    assert net_key("203.0.113.5") == "203.0.113.5/32"
    assert net_key("2400:4151:d5c0:6900:2d72:307a:3bb7:8db8") == net_key("2400:4151:d5c0:6900::1") == "2400:4151:d5c0:6900::/64"
    assert net_key("2400:4151:d5c0:6901::1") != net_key("2400:4151:d5c0:6900::1")
    assert net_key("testclient") is None and net_key(None) is None


async def test_ipv6_addresses_in_the_same_64_share_the_video_limit(make_client):
    """IPv6 は同じ家庭・端末の中でアドレスが変わるため、先頭 64 ビットが同じなら同じネットワークとして数える。"""
    await set_setting(video_daily_limit=5, video_ip_daily_limit=2)
    o = await _video_offer()
    server = await make_client()
    for i, ip in enumerate(("2400:4151:d5c0:6900::a", "2400:4151:d5c0:6900:ffff::b")):
        u = await create_user()
        c = await make_client(ip)
        await login_as(c, u)
        r = await c.post(f"/api/offers/{o.id}/start")
        assert r.status_code == 200, (i, r.text)
        await server.http.get("/api/postbacks/adnetwork", params=_params(r.json()["click_id"]))
    # 同じ /64 の別のアドレスからは上限、別のネットワークからは視聴できる
    same, other = await make_client("2400:4151:d5c0:6900::c"), await make_client("2400:4151:d5c0:7777::c")
    for c in (same, other):
        await login_as(c, await create_user())
    assert (await same.post(f"/api/offers/{o.id}/start")).json()["error"]["code"] == "video_ip_daily_limit"
    assert (await other.post(f"/api/offers/{o.id}/start")).status_code == 200


async def test_viewing_same_ip_list_is_recorded_in_audit_log(make_client, db_session):
    from app.models import AdminAuditLog

    admin, u = await create_user(role="admin"), await create_user()
    ac = await make_client()
    await login_as(ac, admin)
    assert (await ac.get(f"/api/admin/users/{u.id}/same-ip")).status_code == 200
    async with db_session() as db:
        log = await db.scalar(select(AdminAuditLog).where(AdminAuditLog.action == "user.view_same_ip"))
        assert log is not None and log.actor_id == admin.id and log.target_id == str(u.id)


async def test_old_ip_addresses_are_purged_after_retention(make_client, db_session):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import update

    from app.models import UserSession
    from app.services import privacy

    await set_setting(ip_retention_days=90)
    old, new = await create_user(), await create_user()
    for u in (old, new):
        await login_as(await make_client(), u)
    async with db_session() as db:
        long_ago = datetime.now(UTC) - timedelta(days=91)
        await db.execute(update(User).where(User.id.in_([old.id, new.id])).values(signup_ip="203.0.113.9"))
        await db.execute(update(User).where(User.id == old.id).values(created_at=long_ago))
        await db.execute(update(UserSession).where(UserSession.user_id == old.id).values(created_at=long_ago))
        await db.commit()
        counts = await privacy.purge_old_ips(db)
        assert counts["users"] >= 1 and counts["sessions"] >= 1
        assert await db.scalar(select(User.signup_ip).where(User.id == old.id)) is None
        assert await db.scalar(select(User.signup_ip).where(User.id == new.id)) == "203.0.113.9"
        assert await db.scalar(select(UserSession.ip).where(UserSession.user_id == old.id)) is None
        assert await db.scalar(select(UserSession.ip).where(UserSession.user_id == new.id)) is not None
        # 会員そのものは残る
        assert await db.get(User, old.id) is not None


async def test_cleanup_test_data_removes_only_qa_data(db_session):
    from app.cli import cleanup_test_data
    from app.models import Gacha
    from tests.conftest import create_gacha

    qa = await create_user(email="qa-a-zz@example.com", balance=5)
    real = await create_user(email="real-user@example.com")
    g = await create_gacha()
    async with db_session() as db:
        gg = await db.get(Gacha, g.id)
        gg.slug = "qa-lastone-zz"
        await db.commit()
    await cleanup_test_data()
    async with db_session() as db:
        assert await db.get(User, qa.id) is None
        assert await db.get(User, real.id) is not None
        assert await db.get(Gacha, g.id) is None
