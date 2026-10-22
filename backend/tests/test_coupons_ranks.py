"""クーポンコード（使い捨て型・先着型）と、当選ランクの表示名・演出の設定。"""

import asyncio

from sqlalchemy import func, select

from app.models import Coupon, CouponRedemption
from tests.conftest import balance_of, create_user, login_as


async def _admin(make_client):
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    return ac


async def test_single_use_coupon_works_once(client, make_client):
    ac = await _admin(make_client)
    r = await ac.post("/api/admin/coupons", json={"kind": "single", "tickets": 5, "count": 3, "prefix": "dm", "note": "X の DM"})
    assert r.status_code == 200, r.text
    codes = [c["code"] for c in r.json()["items"]]
    assert len(set(codes)) == 3 and all(c.startswith("DM") and len(c) == 12 for c in codes)
    u = await create_user()
    await login_as(client, u)
    r = await client.post("/api/coupons/redeem", json={"code": f"  {codes[0].lower()} "})  # 小文字・空白も受け付ける
    assert r.status_code == 200 and r.json()["tickets"] == 5 and r.json()["balance"] == 5
    u2 = await create_user()
    c2 = await make_client()
    await login_as(c2, u2)
    r = await c2.post("/api/coupons/redeem", json={"code": codes[0]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "coupon_used_up"  # 使い捨て：他の人は使えない
    assert (await c2.post("/api/coupons/redeem", json={"code": "NOPE1234"})).json()["error"]["code"] == "coupon_invalid"


async def test_shared_coupon_first_come_and_once_per_user(make_client):
    ac = await _admin(make_client)
    r = await ac.post("/api/admin/coupons", json={"kind": "shared", "tickets": 3, "code": "WAKU-OPEN", "max_uses": 2})
    assert r.status_code == 200, r.text
    clients = []
    for _ in range(3):
        u = await create_user()
        c = await make_client()
        await login_as(c, u)
        clients.append((u, c))
    r = await clients[0][1].post("/api/coupons/redeem", json={"code": "waku-open"})
    assert r.status_code == 200
    r = await clients[0][1].post("/api/coupons/redeem", json={"code": "WAKU-OPEN"})
    assert r.json()["error"]["code"] == "coupon_already_used"  # 1 人 1 回
    assert (await clients[1][1].post("/api/coupons/redeem", json={"code": "WAKU-OPEN"})).status_code == 200
    r = await clients[2][1].post("/api/coupons/redeem", json={"code": "WAKU-OPEN"})
    assert r.json()["error"]["code"] == "coupon_used_up"  # 先着 2 名で終了
    assert await balance_of(clients[0][0].id) == 3 and await balance_of(clients[2][0].id) == 0
    # 同じあいことばは重複して作れない
    r = await ac.post("/api/admin/coupons", json={"kind": "shared", "tickets": 1, "code": "waku-open", "max_uses": 5})
    assert r.json()["error"]["code"] == "coupon_exists"


async def test_shared_coupon_never_exceeds_limit_under_concurrency(make_client, db_session):
    ac = await _admin(make_client)
    await ac.post("/api/admin/coupons", json={"kind": "shared", "tickets": 1, "code": "RUSH", "max_uses": 3})
    clients = []
    for _ in range(8):
        u = await create_user()
        c = await make_client()
        await login_as(c, u)
        clients.append(c)
    rs = await asyncio.gather(*(c.post("/api/coupons/redeem", json={"code": "RUSH"}) for c in clients))
    assert sum(r.status_code == 200 for r in rs) == 3
    async with db_session() as db:
        c = await db.scalar(select(Coupon).where(Coupon.code == "RUSH"))
        assert c.uses == 3 and await db.scalar(select(func.count()).select_from(CouponRedemption)) == 3


async def test_coupon_disabled_expired_and_requires_verified_email(client, make_client):
    from datetime import UTC, datetime, timedelta

    ac = await _admin(make_client)
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    await ac.post("/api/admin/coupons", json={"kind": "shared", "tickets": 1, "code": "OLDCODE", "max_uses": 9, "expires_at": past})
    made = (await ac.post("/api/admin/coupons", json={"kind": "shared", "tickets": 1, "code": "STOPPED", "max_uses": 9})).json()["items"][0]
    assert (await ac.post(f"/api/admin/coupons/{made['id']}/active", json={"is_active": False})).status_code == 200
    u = await create_user()
    await login_as(client, u)
    assert (await client.post("/api/coupons/redeem", json={"code": "OLDCODE"})).json()["error"]["code"] == "coupon_expired"
    assert (await client.post("/api/coupons/redeem", json={"code": "STOPPED"})).json()["error"]["code"] == "coupon_invalid"
    unverified = await create_user(verified=False)
    c2 = await make_client()
    await login_as(c2, unverified)
    assert (await c2.post("/api/coupons/redeem", json={"code": "OLDCODE"})).status_code == 403
    # 一般会員は発行できない
    assert (await client.post("/api/admin/coupons", json={"kind": "single", "tickets": 1})).status_code == 403


async def test_rank_labels_and_effects(client, make_client):
    r = await client.get("/api/ranks")
    assert [x["label"] for x in r.json()] == ["特賞", "大当たり", "中当たり", "小当たり"]
    ac = await _admin(make_client)
    r = await ac.put("/api/admin/ranks/SSR", json={"label": "特賞", "video_url": "/api/media/effects/a.mp4", "logo_url": "/api/media/prizes/l.webp"})
    assert r.status_code == 200 and r.json()["updated_at"]
    r = await ac.put("/api/admin/ranks/SR", json={"label": "大当たり", "video_url": "/api/media/effects/b.mp4"})  # 2 回目以降の更新も
    assert r.status_code == 200, r.text
    ssr = (await client.get("/api/ranks")).json()[0]
    assert ssr["video_url"] == "/api/media/effects/a.mp4" and ssr["logo_url"] == "/api/media/prizes/l.webp"
    assert (await client.put("/api/admin/ranks/SSR", json={"label": "x"})).status_code in (401, 403)


async def test_effect_video_upload_accepts_mp4_only(make_client):
    ac = await _admin(make_client)
    mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
    r = await ac.http.post("/api/admin/uploads?folder=effects", files={"file": ("e.mp4", mp4, "video/mp4")},
                           headers={"X-CSRF-Token": ac.http.cookies.get("hf_csrf")})
    assert r.status_code == 200 and r.json()["kind"] == "video" and r.json()["url"].endswith(".mp4")
    r = await ac.http.post("/api/admin/uploads?folder=effects", files={"file": ("e.mov", b"not a video at all", "video/quicktime")},
                           headers={"X-CSRF-Token": ac.http.cookies.get("hf_csrf")})
    assert r.status_code == 400
