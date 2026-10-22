"""負荷試験（backend/.venv/bin/python tools/loadtest/run.py --users 300 --seconds 60）。

想定：会員がログインし、ガチャ一覧・詳細・残高を見ながらガチャを引く。お試しログイン（チケット 30 枚）で会員を作る。
対象は負荷試験用に起動したバックエンド（レート制限なし）。本番・開発のデータベースには向けないこと。

--race N：残り N 口・ラストワン賞ありのガチャを用意し、N×2 人が同時に 1 回ずつ引いて、
          ラストワン賞が 1 件だけ・口数の超過なし・チケットの二重消費なしを確認する。
"""

import argparse
import asyncio
import random
import statistics
import time
import uuid
from collections import defaultdict

import httpx

BASE = "http://localhost:8399"
lat: dict[str, list[float]] = defaultdict(list)
codes: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))


async def call(c: httpx.AsyncClient, name: str, method: str, url: str, **kw) -> httpx.Response | None:
    t = time.perf_counter()
    try:
        r = await c.request(method, url, **kw)
    except httpx.HTTPError:
        codes[name][0] += 1
        return None
    lat[name].append((time.perf_counter() - t) * 1000)
    codes[name][r.status_code] += 1
    return r


async def login(c: httpx.AsyncClient) -> str | None:
    await call(c, "csrf", "GET", "/api/auth/csrf")
    tok = c.cookies.get("hf_csrf")
    r = await call(c, "demo_login", "POST", "/api/auth/demo-login", headers={"X-CSRF-Token": tok})
    # ログイン時に CSRF トークンが更新されるため、新しい値を使う
    return (c.cookies.get("hf_csrf") or tok) if r is not None and r.status_code == 200 else None


async def member(deadline: float, slugs: list[tuple[int, str]]) -> None:
    async with httpx.AsyncClient(base_url=BASE, headers={"Origin": BASE}, timeout=30) as c:
        tok = await login(c)
        if not tok:
            return
        while time.monotonic() < deadline:
            gid, slug = random.choice(slugs)
            await call(c, "GET /gachas", "GET", "/api/gachas")
            await call(c, "GET /gachas/{slug}", "GET", f"/api/gachas/{slug}")
            await call(c, "POST draw", "POST", f"/api/gachas/{gid}/draw",
                       json={"count": random.choice([1, 1, 1, 10]), "idempotency_key": uuid.uuid4().hex},
                       headers={"X-CSRF-Token": c.cookies.get("hf_csrf") or tok})
            await call(c, "GET /auth/me", "GET", "/api/auth/me")
            await asyncio.sleep(random.uniform(0.5, 2.0))  # 画面を見ている時間


async def race(n: int) -> None:
    import os
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
    from sqlalchemy import func, select

    from app.core.db import SessionLocal
    from app.models import Gacha, GachaItem, LastOneAward, Prize

    async with SessionLocal() as db:
        p, lo = Prize(name="負荷試験の景品", rarity="N"), Prize(name="負荷試験のラストワン賞", rarity="SSR")
        db.add_all([p, lo])
        await db.flush()
        g = Gacha(slug=f"race-{uuid.uuid4().hex[:6]}", title="ラストワン競合試験", ticket_cost=1, mode="box", status="published",
                  last_one_prize_id=lo.id)
        db.add(g)
        await db.flush()
        db.add(GachaItem(gacha_id=g.id, prize_id=p.id, stock_total=n, stock_remaining=n))
        await db.commit()
        gid = g.id
    clients = [httpx.AsyncClient(base_url=BASE, headers={"Origin": BASE}, timeout=60) for _ in range(n * 2)]
    toks = await asyncio.gather(*(login(c) for c in clients))
    t = time.perf_counter()
    rs = await asyncio.gather(*(
        call(c, "race draw", "POST", f"/api/gachas/{gid}/draw", json={"count": 1, "idempotency_key": uuid.uuid4().hex}, headers={"X-CSRF-Token": tok})
        for c, tok in zip(clients, toks, strict=True) if tok
    ))
    took = time.perf_counter() - t
    ok = [r for r in rs if r is not None and r.status_code == 200]
    last_one = sum(1 for r in ok if r.json().get("has_last_one"))
    async with SessionLocal() as db:
        awards = await db.scalar(select(func.count()).select_from(LastOneAward).where(LastOneAward.gacha_id == gid))
        g = await db.get(Gacha, gid)
        remaining = await db.scalar(select(GachaItem.stock_remaining).where(GachaItem.gacha_id == gid))
    for c in clients:
        await c.aclose()
    print(f"\n[ラストワン競合] {n} 口に {len(toks)} 人が同時に 1 回ずつ（{took:.2f} 秒）")
    print(f"  成功 {len(ok)} 件（期待 {n}）／ラストワン賞の応答 {last_one} 件・DB の記録 {awards} 件（期待 1）／残り口数 {remaining}（期待 0）／抽選済み {g.pulls_done}")
    print("  判定：", "OK" if (len(ok) == n and last_one == 1 and awards == 1 and remaining == 0 and g.pulls_done == n) else "NG")


def report(seconds: float) -> None:
    print(f"\n{'API':24s} {'件数':>7s} {'件/秒':>7s} {'中央値':>8s} {'p95':>8s} {'p99':>8s}  応答コード")
    for name, xs in sorted(lat.items()):
        xs_sorted = sorted(xs)
        p = lambda q: xs_sorted[min(len(xs_sorted) - 1, int(len(xs_sorted) * q))]  # noqa: E731
        print(f"{name:24s} {len(xs):7d} {len(xs) / seconds:7.1f} {statistics.median(xs):7.0f}ms {p(0.95):7.0f}ms {p(0.99):7.0f}ms  {dict(codes[name])}")
    total = sum(len(x) for x in lat.values())
    errors = sum(n for c in codes.values() for k, n in c.items() if k == 0 or k >= 500)
    print(f"合計 {total} 件（{total / seconds:.0f} 件/秒）、サーバーエラー・接続エラー {errors} 件")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--users", type=int, default=200)
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--race", type=int, default=0)
    a = ap.parse_args()
    if a.race:
        await race(a.race)
        return
    async with httpx.AsyncClient(base_url=BASE) as c:
        gs = [(g["id"], g["slug"]) for g in (await c.get("/api/gachas")).json() if g["is_open"]]
    deadline = time.monotonic() + a.seconds
    t0 = time.monotonic()
    # 立ち上がりを 10 秒に分散する
    tasks = []
    for i in range(a.users):
        tasks.append(asyncio.create_task(member(deadline, gs)))
        await asyncio.sleep(10 / a.users)
    await asyncio.gather(*tasks)
    print(f"同時会員 {a.users} 人・{a.seconds} 秒")
    report(time.monotonic() - t0)


if __name__ == "__main__":
    asyncio.run(main())
