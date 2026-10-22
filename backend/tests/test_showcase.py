"""トップページ用 API：キャンペーンバナー・注目の景品・実績・メール登録・SNS リンク。"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.models import Banner, NewsletterSubscription, Prize
from tests.conftest import create_gacha, create_user, login_as


async def test_banners_only_active_within_period(client, db_session):
    now = datetime.now(UTC)
    async with db_session() as db:
        db.add_all([
            Banner(title="開催中", sort_order=2, starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=1)),
            Banner(title="先頭", sort_order=1),
            Banner(title="終了", ends_at=now - timedelta(minutes=1)),
            Banner(title="開始前", starts_at=now + timedelta(days=1)),
            Banner(title="停止中", is_active=False),
        ])
        await db.commit()
    titles = [b["title"] for b in (await client.get("/api/banners")).json()]
    assert titles == ["先頭", "開催中"]


async def test_featured_prizes_with_gacha_link(client, db_session):
    g = await create_gacha()
    async with db_session() as db:
        p = (await db.execute(select(Prize).order_by(Prize.id).limit(1))).scalar_one()
        p.is_featured, p.subtitle, p.featured_order = True, "星の乙女", 1
        db.add(Prize(name="非掲載", rarity="N"))
        await db.commit()
    items = (await client.get("/api/featured-prizes")).json()
    assert len(items) == 1 and items[0]["subtitle"] == "星の乙女" and items[0]["gacha_slug"] == g.slug


async def test_public_stats_are_real_and_exclude_demo(client, monkeypatch):
    from app.core import config

    await create_user(balance=5)
    await create_user(verified=False)
    monkeypatch.setattr(config.settings, "demo_login_enabled", True)
    await client.post("/api/auth/demo-login")  # お試しアカウント（300 枚付与）は会員数に含めない
    await create_gacha(items=[("N", 1, None), ("SSR", 1, None)])
    s = (await client.get("/api/stats/public")).json()
    assert s["members"] == 1
    assert s["tickets_earned"] == 5 + 30
    assert s["items"] == 2
    assert s["signup_bonus"] == 10  # 設定の既定値（新規登録特典のポイント数）


async def test_newsletter_requires_consent_and_dedupes(client, db_session):
    r = await client.post("/api/newsletter", json={"email": "Star@Example.com", "consent": False})
    assert r.status_code == 400
    for _ in range(2):
        r = await client.post("/api/newsletter", json={"email": "Star@Example.com", "consent": True})
        assert r.status_code == 200
    async with db_session() as db:
        assert await db.scalar(select(func.count()).select_from(NewsletterSubscription)) == 1
        assert (await db.execute(select(NewsletterSubscription.email))).scalar_one() == "star@example.com"


async def test_sns_links_only_https(make_client):
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    await ac.put("/api/admin/settings", json={"sns_x_url": "https://x.com/hoshifuru", "sns_instagram_url": "javascript:alert(1)"})
    links = (await ac.get("/api/site-links")).json()
    assert links == {"x": "https://x.com/hoshifuru", "instagram": None, "youtube": None}


async def test_gacha_badge_and_admin_banner_crud(make_client):
    admin = await create_user(role="admin")
    ac = await make_client()
    await login_as(ac, admin)
    g = await create_gacha(badge="人気")
    assert (await ac.get(f"/api/gachas/{g.slug}")).json()["badge"] == "人気"
    r = await ac.post("/api/admin/banners", json={"title": "星座の導き", "tag": "NEW", "tag_color": "gold", "link": "/gacha"})
    assert r.status_code == 201
    bid = r.json()["id"]
    assert (await ac.post("/api/admin/banners", json={"title": "x", "link": "https://evil.example"})).status_code == 422
    assert (await ac.put(f"/api/admin/banners/{bid}", json={"title": "更新", "link": "/gacha/x"})).json()["title"] == "更新"
    assert (await ac.delete(f"/api/admin/banners/{bid}")).status_code == 200
