import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

TEST_DB = os.environ.get("TEST_DATABASE_NAME", "gacha_test")
BASE_URL = os.environ.get("TEST_DATABASE_SERVER", "postgresql+asyncpg://gacha:gacha@localhost:5470")
os.environ.update(
    {
        "ENV": "test",
        "DATABASE_URL": f"{BASE_URL}/{TEST_DB}",
        "MAIL_BACKEND": "memory",
        "RATE_LIMIT_ENABLED": "false",
        "REDIS_URL": "",
        "SECRET_KEY": "test-secret-key-for-pytest-only-0123456789",
        "STORAGE_LOCAL_DIR": str(Path(__file__).parent / ".media"),
        "PUBLIC_BASE_URL": "http://testserver",
        "ENABLE_MOCK_OFFERS": "true",
        "POSTBACK_SECRET_ADNETWORK": "adnetwork-test-secret",
        "SMS_BACKEND": "memory",
    }
)

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


async def _recreate_db() -> None:
    dsn = BASE_URL.replace("+asyncpg", "") + "/postgres"
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{TEST_DB}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
async def database():
    await _recreate_db()
    # マイグレーションファイル自体の正しさも同時に検証する
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND_DIR, check=True, env=os.environ.copy())
    from app.core.db import engine

    yield
    await engine.dispose()


TABLES = None


@pytest.fixture(autouse=True)
async def clean_db(database):
    global TABLES
    from app.core import mail
    from app.core.db import Base, engine
    from app.core.ratelimit import reset_memory

    if TABLES is None:
        TABLES = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    mail.outbox.clear()
    reset_memory()
    from app.core import cache

    cache.clear()
    yield


class Client:
    """CSRF トークンを自動で付与するテスト用クライアント。"""

    def __init__(self, http: httpx.AsyncClient):
        self.http = http

    async def _csrf(self) -> str:
        tok = self.http.cookies.get("hf_csrf")
        if not tok:
            await self.http.get("/api/auth/csrf")
            tok = self.http.cookies.get("hf_csrf")
        return tok

    async def get(self, url, **kw):
        return await self.http.get(url, **kw)

    async def post(self, url, json=None, **kw):
        headers = kw.pop("headers", {})
        headers.setdefault("X-CSRF-Token", await self._csrf())
        return await self.http.post(url, json=json, headers=headers, **kw)

    async def put(self, url, json=None, **kw):
        headers = kw.pop("headers", {})
        headers.setdefault("X-CSRF-Token", await self._csrf())
        return await self.http.put(url, json=json, headers=headers, **kw)

    async def delete(self, url, **kw):
        headers = kw.pop("headers", {})
        headers.setdefault("X-CSRF-Token", await self._csrf())
        return await self.http.delete(url, headers=headers, **kw)

    async def patch(self, url, json=None, **kw):
        headers = kw.pop("headers", {})
        headers.setdefault("X-CSRF-Token", await self._csrf())
        return await self.http.patch(url, json=json, headers=headers, **kw)


@pytest.fixture
async def make_client():
    from app.main import app

    clients: list[httpx.AsyncClient] = []

    async def factory(ip: str = "127.0.0.1") -> Client:
        # ip：アクセス元の IP アドレス（同じネットワークからの上限の確認用）
        http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(ip, 123)), base_url="http://testserver")
        clients.append(http)
        return Client(http)

    yield factory
    for c in clients:
        await c.aclose()


@pytest.fixture
async def client(make_client) -> Client:
    return await make_client()


@pytest.fixture
def db_session():
    from app.core.db import SessionLocal

    return SessionLocal


async def create_user(email=None, password="password123", verified=True, balance=0, role="user", name="テスト"):
    from datetime import UTC, datetime

    from app.core.db import SessionLocal
    from app.core.security import hash_password
    from app.models import User
    from app.services import tickets

    email = email or f"u{uuid.uuid4().hex[:8]}@example.com"
    async with SessionLocal() as db:
        u = User(email=email, password_hash=hash_password(password), display_name=name, role=role,
                 email_verified_at=datetime.now(UTC) if verified else None)
        db.add(u)
        await db.flush()
        await tickets.ensure_wallet(db, u.id)
        if balance:
            await tickets.credit(db, u.id, balance, "admin_grant", "テスト付与")
        await db.commit()
        return u


async def login_as(client: Client, user, password="password123"):
    r = await client.post("/api/auth/login", json={"email": user.email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


async def create_gacha(
    mode="probability", cost=1, items=None, max_pulls=None, last_one=False, status="published", **kw
):
    """items: [(rarity, weight, stock)]"""
    from app.core.db import SessionLocal
    from app.models import Gacha, GachaItem, Prize

    items = items or [("N", 80, None), ("R", 15, None), ("SR", 4, None), ("SSR", 1, None)]
    async with SessionLocal() as db:
        prizes = []
        for i, (rarity, _, _) in enumerate(items):
            p = Prize(name=f"景品{i}-{rarity}", rarity=rarity)
            db.add(p)
            prizes.append(p)
        lo = None
        if last_one:
            lo = Prize(name="ラストワン", rarity="SSR")
            db.add(lo)
        await db.flush()
        g = Gacha(slug=f"g-{uuid.uuid4().hex[:8]}", title="テストガチャ", ticket_cost=cost, mode=mode, status=status,
                  max_pulls=max_pulls, last_one_prize_id=lo.id if lo else None, **kw)
        db.add(g)
        await db.flush()
        for p, (_, w, stock) in zip(prizes, items, strict=True):
            db.add(GachaItem(gacha_id=g.id, prize_id=p.id, weight=w, stock_total=stock, stock_remaining=stock))
        await db.commit()
        return g


async def balance_of(user_id: int) -> int:
    from app.core.db import SessionLocal
    from app.services import tickets

    async with SessionLocal() as db:
        return await tickets.get_balance(db, user_id)


def key() -> str:
    return uuid.uuid4().hex
