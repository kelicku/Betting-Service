"""フェーズ 2：チケットとポイントの 2 つの残高、ポイント景品、ポイント交換（ギフトコード在庫・手動発行・取消）、
動画リワード広告の 1 日の上限、SMS 認証、友達紹介、管理者によるポイント付与。"""

import asyncio
import re
import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update

from app.core import mail
from app.models import Conversion, GiftCode, Prize, ShopItem, ShopOrder, User, UserPrize
from app.providers.hmac_generic import sign
from tests.conftest import balance_of, create_gacha, create_user, key, login_as


async def point_balance(user_id: int) -> int:
    from app.core.db import SessionLocal
    from app.services import points

    async with SessionLocal() as db:
        return await points.get_balance(db, user_id)


async def give_points(user_id: int, n: int) -> None:
    from app.core.db import SessionLocal
    from app.services import points

    async with SessionLocal() as db:
        await points.credit(db, user_id, n, "admin_grant", "テスト")
        await db.commit()


async def set_setting(**values) -> None:
    from app.core.db import SessionLocal
    from app.services import settings_store

    async with SessionLocal() as db:
        admin = await create_user(role="admin")
        await settings_store.set_many(db, values, actor_id=admin.id)
        await db.commit()


async def shop_item(kind="digital_code", cost=500, stock=None, limit=None, codes=()):
    from app.core.db import SessionLocal
    from app.services import shop

    async with SessionLocal() as db:
        it = ShopItem(name=f"ギフト{uuid.uuid4().hex[:4]}", brand="デジコ", kind=kind, point_cost=cost,
                      stock_total=stock, stock_remaining=stock, per_user_limit=limit)
        db.add(it)
        await db.commit()
        if codes:
            admin = await create_user(role="admin")
            await shop.add_codes(db, it.id, list(codes), "2027-12-31", admin)
        return it


# ── ポイント景品 ─────────────────────────────────────────


async def test_point_prize_credits_point_balance_not_tickets(client, db_session):
    u = await create_user(balance=10)
    await login_as(client, u)
    g = await create_gacha(items=[("N", 1, None)])
    async with db_session() as db:
        await db.execute(update(Prize).values(point_value=250))  # このガチャの景品をポイント景品にする
        await db.commit()
    r = await client.post(f"/api/gachas/{g.id}/draw", json={"count": 10, "idempotency_key": key()})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["points_won"] == 2500 and d["point_balance_after"] == 2500 and d["balance_after"] == 0
    assert all(x["point_value"] == 250 for x in d["results"])
    assert await point_balance(u.id) == 2500 and await balance_of(u.id) == 0
    async with db_session() as db:
        # ポイント景品は「獲得した景品」（交換申請の対象）には入らない
        assert await db.scalar(select(func.count()).select_from(UserPrize).where(UserPrize.user_id == u.id)) == 0
    me = (await client.get("/api/auth/me")).json()
    assert me["balance"] == 0 and me["point_balance"] == 2500
    hist = (await client.get("/api/points/transactions")).json()
    assert hist["total"] == 1 and hist["items"][0]["kind"] == "gacha_win" and hist["items"][0]["delta"] == 2500


async def test_admin_can_grant_points_separately(make_client):
    admin = await create_user(role="admin")
    u = await create_user(balance=3)
    ac = await make_client()
    await login_as(ac, admin)
    r = await ac.post(f"/api/admin/users/{u.id}/points", json={"delta": 1500, "reason": "お詫び", "idempotency_key": key()})
    assert r.status_code == 200, r.text
    assert await point_balance(u.id) == 1500 and await balance_of(u.id) == 3
    r = await ac.post(f"/api/admin/users/{u.id}/points", json={"delta": -2000, "reason": "誤付与", "idempotency_key": key()})
    assert r.status_code == 400 and await point_balance(u.id) == 1500
    detail = (await ac.get(f"/api/admin/users/{u.id}")).json()
    assert detail["point_wallet"]["balance"] == 1500 and detail["wallet"]["balance"] == 3


# ── ポイント交換 ─────────────────────────────────────────


async def test_shop_digital_order_delivers_code_from_inventory(client):
    u = await create_user()
    await give_points(u.id, 1200)
    await login_as(client, u)
    it = await shop_item(cost=500, codes=["CODE-AAA", "CODE-BBB"])
    items = (await client.get("/api/shop/items")).json()
    assert next(x for x in items if x["id"] == it.id)["instant"] is True
    r = await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["status"] == "fulfilled" and o["gift_code"] == "CODE-AAA" and o["point_balance"] == 700
    assert o["gift_code_expires_on"] == "2027-12-31"
    assert "ギフトコードをお渡ししました" in mail.outbox[-1].subject
    listed = (await client.get("/api/shop/orders")).json()["items"]
    assert listed[0]["gift_code"] == "CODE-AAA"


async def test_shop_insufficient_points_and_idempotency(client, db_session):
    u = await create_user()
    await give_points(u.id, 600)
    await login_as(client, u)
    it = await shop_item(cost=500)
    k = key()
    r1 = await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": k})
    r2 = await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": k})
    assert r1.status_code == r2.status_code == 200 and r1.json()["id"] == r2.json()["id"]
    assert r1.json()["status"] == "pending"  # コード在庫なし → 手動発行待ち
    assert await point_balance(u.id) == 100
    r3 = await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})
    assert r3.status_code == 402 and r3.json()["error"]["code"] == "insufficient_points"
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(ShopOrder)) == 1


async def test_shop_stock_and_per_user_limit(client):
    u = await create_user()
    await give_points(u.id, 10_000)
    await login_as(client, u)
    it = await shop_item(cost=100, stock=5, limit=1)
    assert (await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})).status_code == 200
    r = await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})
    assert r.status_code == 409 and r.json()["error"]["code"] == "shop_limit"
    sold = await shop_item(cost=100, stock=0)
    r = await client.post("/api/shop/orders", json={"item_id": sold.id, "idempotency_key": key()})
    assert r.status_code == 409 and r.json()["error"]["code"] == "sold_out"


async def test_shop_last_code_goes_to_only_one_of_concurrent_orders(make_client, db_session):
    it = await shop_item(cost=100, codes=["ONLY-ONE"])
    clients = []
    for _ in range(4):
        u = await create_user()
        await give_points(u.id, 100)
        c = await make_client()
        await login_as(c, u)
        clients.append(c)
    rs = await asyncio.gather(*(c.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()}) for c in clients))
    assert all(r.status_code == 200 for r in rs)
    statuses = sorted(r.json()["status"] for r in rs)
    assert statuses == ["fulfilled", "pending", "pending", "pending"]
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(GiftCode).where(GiftCode.order_id.is_not(None))) == 1


async def test_uploading_codes_delivers_to_waiting_orders(client, make_client):
    u = await create_user()
    await give_points(u.id, 1000)
    await login_as(client, u)
    it = await shop_item(cost=500)
    o = (await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})).json()
    assert o["status"] == "pending"
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    r = await ac.post(f"/api/admin/shop/items/{it.id}/codes", json={"codes": "NEW-1\nNEW-1\n\nNEW-2"})
    assert r.json() == {"added": 2, "skipped_duplicates": 0, "delivered_to_waiting": 1}
    mine = (await client.get("/api/shop/orders")).json()["items"][0]
    assert mine["status"] == "fulfilled" and mine["gift_code"] == "NEW-1"
    # 運営画面ではコードの中身を返さない
    detail = (await ac.get(f"/api/admin/shop/orders/{o['id']}")).json()
    assert detail["gift_code"] is None and detail["gift_code_assigned"] is True


async def test_admin_manual_fulfill_and_cancel_refund(client, make_client):
    u = await create_user()
    await give_points(u.id, 1000)
    await login_as(client, u)
    it = await shop_item(cost=400)
    o1 = (await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})).json()
    o2 = (await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})).json()
    assert await point_balance(u.id) == 200
    staff = await create_user(role="staff")
    sc = await make_client()
    await login_as(sc, staff)
    r = await sc.post(f"/api/admin/shop/orders/{o1['id']}/transition", json={"to": "fulfilled"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "code_required"
    r = await sc.post(f"/api/admin/shop/orders/{o1['id']}/transition", json={"to": "fulfilled", "code": "MANUAL-123"})
    assert r.status_code == 200 and r.json()["status"] == "fulfilled"
    r = await sc.post(f"/api/admin/shop/orders/{o2['id']}/transition", json={"to": "cancelled", "note": "在庫不足のため"})
    assert r.status_code == 200
    assert await point_balance(u.id) == 600  # 取消分の 400pt が戻る
    r = await sc.post(f"/api/admin/shop/orders/{o2['id']}/transition", json={"to": "fulfilled", "code": "X"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"
    mine = {x["id"]: x for x in (await client.get("/api/shop/orders")).json()["items"]}
    assert mine[o1["id"]]["gift_code"] == "MANUAL-123" and mine[o2["id"]]["admin_note"] == "在庫不足のため"
    # 一般会員は管理 API を使えない
    assert (await client.get("/api/admin/shop/orders")).status_code == 403


async def test_user_cancel_pending_shipping_order(client):
    u = await create_user()
    await give_points(u.id, 900)
    await login_as(client, u)
    it = await shop_item(kind="shipping", cost=900, stock=1)
    r = await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})
    assert r.status_code == 400 and r.json()["error"]["code"] == "shipping_required"
    ship = {"name": "山田 花子", "postal_code": "100-0001", "prefecture": "東京都", "address1": "千代田区1-1", "phone": "090-1111-2222"}
    o = (await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key(), "shipping": ship})).json()
    assert o["status"] == "pending" and o["recipient_masked"] == "山田 ●●" and await point_balance(u.id) == 0
    items = (await client.get("/api/shop/items")).json()
    assert next(x for x in items if x["id"] == it.id)["sold_out"] is True
    c = await client.post(f"/api/shop/orders/{o['id']}/cancel")
    assert c.status_code == 200 and c.json()["status"] == "cancelled" and await point_balance(u.id) == 900
    items = (await client.get("/api/shop/items")).json()
    assert next(x for x in items if x["id"] == it.id)["sold_out"] is False


# ── 動画リワード広告の 1 日の上限 ───────────────────────────


SECRET = "adnetwork-test-secret"


def _params(click_id):
    p = {"click_id": click_id, "conversion_id": uuid.uuid4().hex, "status": "approved", "payout": "10", "ts": str(int(time.time()))}
    p["sig"] = sign(p, SECRET)
    return p


async def test_video_reward_daily_limit(client, make_client, db_session):
    from app.core.db import SessionLocal
    from app.models import Offer

    await set_setting(video_daily_limit=3)
    async with SessionLocal() as db:
        o = Offer(provider="adnetwork", kind="video", title="動画", url_template="https://ads.example/?c={click_id}", reward_tickets=3, per_user_limit=1)
        db.add(o)
        await db.commit()
    u = await create_user()
    await login_as(client, u)
    server = await make_client()
    clicks = []
    for _ in range(4):
        r = await client.post(f"/api/offers/{o.id}/start")
        assert r.status_code == 200, r.text  # 1 日の上限までは何度でも開始できる（案件ごとの回数上限は使わない）
        clicks.append(r.json()["click_id"])
        if len(clicks) == 3:
            break
    for c in clicks:
        assert (await server.http.get("/api/postbacks/adnetwork", params=_params(c))).status_code == 200
    assert await balance_of(u.id) == 9
    offers = (await client.get("/api/offers")).json()
    v = next(x for x in offers if x["id"] == o.id)
    assert v["daily_used"] == 3 and v["daily_limit"] == 3
    r = await client.post(f"/api/offers/{o.id}/start")
    assert r.status_code == 409 and r.json()["error"]["code"] == "video_daily_limit"
    # 画面を通さずに通知が届いても、上限を超えた分は付与しない
    r = await server.http.get("/api/postbacks/adnetwork", params=_params(clicks[0]))
    assert r.status_code == 200 and await balance_of(u.id) == 9
    async with db_session() as db:
        assert await db.scalar(select(Conversion.reject_reason).where(Conversion.status == "rejected")) == "daily_limit"
        # 日付が変わると（日本時間 0:00）また視聴できる
        await db.execute(update(Conversion).values(received_at=datetime.now(UTC) - timedelta(days=1, hours=1)))
        await db.commit()
    assert (await client.post(f"/api/offers/{o.id}/start")).status_code == 200


# ── SMS 認証 ─────────────────────────────────────────────


def _code() -> str:
    from app.services import sms

    return re.search(r"確認コード：(\d{6})", sms.outbox[-1].body).group(1)


async def test_sms_verification_flow_and_gating(client, make_client):
    """SMS 認証は登録時ではなく、ポイント交換・景品の発送申請の前に必要（お客さまの方針）。ガチャ・チケット獲得には不要。"""
    from app.services import sms

    await set_setting(sms_verification_required=True)
    u = await create_user(balance=5)
    await give_points(u.id, 1000)
    await login_as(client, u)
    g = await create_gacha()
    r = await client.post(f"/api/gachas/{g.id}/draw", json={"count": 1, "idempotency_key": key()})
    assert r.status_code == 200, r.text  # ガチャは SMS 認証なしで引ける
    assert (await client.get("/api/auth/me")).json()["sms_required"] is True
    it = await shop_item(cost=500)
    r = await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})
    assert r.status_code == 403 and r.json()["error"]["code"] == "phone_not_verified"
    r = await client.post("/api/exchanges", json={"user_prize_ids": [1], "idempotency_key": key()})
    assert r.status_code == 403 and r.json()["error"]["code"] == "phone_not_verified"

    assert (await client.post("/api/phone/send-code", json={"phone": "03-1234-5678"})).status_code == 400  # 固定電話は不可
    r = await client.post("/api/phone/send-code", json={"phone": "090-1234-5678"})
    assert r.status_code == 200 and r.json()["last4"] == "5678"
    assert sms.outbox[-1].to == "+819012345678"
    good = _code()
    bad = "000000" if good != "000000" else "111111"
    r = await client.post("/api/phone/verify", json={"code": bad})
    assert r.status_code == 400 and "あと 4 回" in r.json()["error"]["message"]
    r = await client.post("/api/phone/verify", json={"code": good})
    assert r.status_code == 200 and r.json()["last4"] == "5678"
    me = (await client.get("/api/auth/me")).json()
    assert me["phone_verified"] is True and me["sms_required"] is False
    r = await client.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})
    assert r.status_code == 200, r.text

    # 同じ番号は別のアカウントで使えない（番号はハッシュで照合）
    u2 = await create_user()
    c2 = await make_client()
    await login_as(c2, u2)
    r = await c2.post("/api/phone/send-code", json={"phone": "+81 90 1234 5678"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "phone_in_use"


async def test_sms_code_expiry_attempts_and_rate_limit(client, db_session):
    from app.models import SmsCode

    u = await create_user()
    await login_as(client, u)
    for _ in range(3):
        assert (await client.post("/api/phone/send-code", json={"phone": "080-0000-1111"})).status_code == 200
    r = await client.post("/api/phone/send-code", json={"phone": "080-0000-1111"})
    assert r.status_code == 429
    for _ in range(5):
        await client.post("/api/phone/verify", json={"code": "999999" if _code() != "999999" else "888888"})
    r = await client.post("/api/phone/verify", json={"code": _code()})
    assert r.status_code == 400 and r.json()["error"]["code"] == "sms_code_locked"
    async with db_session() as db:
        await db.execute(update(SmsCode).values(attempts=0, expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        await db.commit()
    r = await client.post("/api/phone/verify", json={"code": _code()})
    assert r.status_code == 400 and r.json()["error"]["code"] == "sms_code_expired"
    async with db_session() as db:
        u_db = await db.get(User, u.id)
        assert u_db.phone_verified_at is None and u_db.phone_hash is None


# ── 友達紹介 ─────────────────────────────────────────────


def _verify_token() -> str:
    return re.search(r"token=([A-Za-z0-9_\-]+)", mail.outbox[-1].body).group(1)


async def _register(client, email: str, invite: str | None = None):
    body = {"email": email, "password": "password123", "display_name": "ともだち", "agree_terms": True}
    if invite:
        body["invite_code"] = invite
    assert (await client.post("/api/auth/register", json=body)).status_code == 202
    r = await client.post("/api/auth/verify-email", json={"token": _verify_token()})
    assert r.status_code == 200, r.text


async def test_referral_rewards_both_after_verification(client, make_client, db_session):
    await set_setting(referral_inviter_tickets=10, referral_invitee_tickets=5, signup_bonus_tickets=0, signup_bonus_points=300)
    inviter = await create_user()
    await login_as(client, inviter)
    code = (await client.get("/api/invite")).json()["invite_code"]
    assert re.fullmatch(r"[A-Z2-9]{8}", code)
    newbie = await make_client()
    await _register(newbie, "friend@example.com", invite=code.lower())
    async with db_session() as db:
        f = await db.scalar(select(User).where(User.email == "friend@example.com"))
        assert f.referred_by_id == inviter.id and f.referral_rewarded_at is not None
    assert await balance_of(f.id) == 5 and await balance_of(inviter.id) == 10
    assert await point_balance(f.id) == 300  # 新規登録特典のポイント
    info = (await client.get("/api/invite")).json()
    assert info["invited"] == 1 and info["completed"] == 1
    # 不明なコードは無視して登録できる
    other = await make_client()
    await _register(other, "nobody@example.com", invite="ZZZZZZZZ")
    async with db_session() as db:
        assert (await db.scalar(select(User).where(User.email == "nobody@example.com"))).referred_by_id is None


async def test_referral_waits_for_sms_when_required(client, make_client):
    from app.services import sms

    await set_setting(sms_verification_required=True, referral_inviter_tickets=10, referral_invitee_tickets=5, signup_bonus_tickets=0)
    inviter = await create_user()
    await login_as(client, inviter)
    code = (await client.get("/api/invite")).json()["invite_code"]
    newbie = await make_client()
    await _register(newbie, "friend2@example.com", invite=code)
    await newbie.post("/api/auth/login", json={"email": "friend2@example.com", "password": "password123"})
    me = (await newbie.get("/api/auth/me")).json()
    assert await balance_of(me["id"]) == 0 and await balance_of(inviter.id) == 0  # まだ SMS 認証前
    await newbie.post("/api/phone/send-code", json={"phone": "070-2222-3333"})
    assert (await newbie.post("/api/phone/verify", json={"code": _code()})).status_code == 200
    assert await balance_of(me["id"]) == 5 and await balance_of(inviter.id) == 10
    assert sms.outbox


async def test_sms_rejects_international_numbers(client):
    """海外の番号への送信は受け付けない（SMS パンピングによる費用の不正発生を防ぐ）。"""
    from app.services import sms

    u = await create_user()
    await login_as(client, u)
    for phone in ["+1 415 555 0100", "+44 7700 900123", "+86 138 0013 8000"]:
        r = await client.post("/api/phone/send-code", json={"phone": phone})
        assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_phone"
    assert sms.outbox == [] or all(m.to.startswith("+81") for m in sms.outbox)


async def test_handed_out_gift_code_is_never_given_again_even_if_order_is_deleted(make_client, db_session):
    """会員（と申請）が削除されて order_id が空になっても、一度渡したコードを別の会員に渡さない。"""
    from sqlalchemy import delete

    from app.services import shop

    it = await shop_item(cost=100, codes=["ONLY-ONE-CODE"])
    a, b = await create_user(), await create_user()
    await give_points(a.id, 500)
    await give_points(b.id, 500)
    ca, cb = await make_client(), await make_client()
    await login_as(ca, a)
    await login_as(cb, b)
    r = await ca.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})
    assert r.status_code == 200 and r.json()["gift_code"] == "ONLY-ONE-CODE"
    async with db_session() as db:
        await db.execute(delete(User).where(User.id == a.id))  # 申請も一緒に削除され、コードの order_id は空になる
        await db.commit()
        assert (await shop.available_codes(db, [it.id])).get(it.id, 0) == 0
    r = await cb.post("/api/shop/orders", json={"item_id": it.id, "idempotency_key": key()})
    assert r.status_code == 200 and r.json()["status"] == "pending" and not r.json().get("gift_code")
