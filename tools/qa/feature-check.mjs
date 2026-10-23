// お客さまへお知らせした 10 項目（2026-10-23）を、実際のブラウザ（Google Chrome）で細かく確認する。
//   node tools/qa/feature-check.mjs      （docker compose で起動中の http://localhost:3300 に対して実行）
// 開発・デモ環境専用：テスト用のガチャ・お試しアカウントを作り、設定を一時的に変更して最後に元へ戻す。
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "frontend/package.json"));
const { chromium } = require("@playwright/test");

const BASE = process.env.QA_BASE_URL || "http://localhost:3300";
const RUN = Date.now().toString(36);
const results = [];
const pageErrors = [];
const serverErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
async function step(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true });
    console.log(`✅ ${name}${note ? `（${note}）` : ""}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`❌ ${name}：${String(e.message || e).split("\n")[0].slice(0, 260)}`);
  }
}
const sh = (cmd) => execSync(cmd, { cwd: root }).toString().trim();
const py = (code) => execSync("docker compose exec -T backend python -", { cwd: root, input: code }).toString().trim();

async function api(page, method, p, body) {
  return page.evaluate(
    async ([m, p, b]) => {
      let t = document.cookie.match(/hf_csrf=([^;]+)/)?.[1];
      if (!t) {
        await fetch("/api/auth/csrf");
        t = document.cookie.match(/hf_csrf=([^;]+)/)[1];
      }
      const r = await fetch("/api" + p, { method: m, headers: { "Content-Type": "application/json", "X-CSRF-Token": t }, body: b ? JSON.stringify(b) : undefined });
      let j = null;
      try {
        j = await r.json();
      } catch {}
      return { status: r.status, body: j };
    },
    [method, p, body],
  );
}

// 効果音の計測：Web Audio の発音（オシレーターの開始）を数える
const AUDIO_PROBE = () => {
  window.__osc = 0;
  const AC = window.AudioContext;
  if (!AC) return;
  const orig = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function (...a) {
    const o = orig.apply(this, a);
    const start = o.start.bind(o);
    o.start = (...b) => {
      window.__osc++;
      return start(...b);
    };
    return o;
  };
};

const browser = await chromium.launch({ channel: "chrome" });
async function page(opts = {}, motion = "off") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  await ctx.addInitScript(AUDIO_PROBE);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => pageErrors.push(`${p.url()} ${e.message}`));
  p.on("response", (r) => r.status() >= 500 && serverErrors.push(`${r.status()} ${r.url()}`));
  await p.goto(BASE + "/");
  await p.evaluate((m) => localStorage.setItem("hf_motion_level", m), motion);
  return p;
}
async function guest(opts = {}, motion = "off") {
  const p = await page(opts, motion);
  let r = await api(p, "POST", "/auth/demo-login");
  if (r.status === 429) {
    // お試しログインは 1 時間 10 回まで（同じ PC から多数作るため、開発環境の制限カウントを消してやり直す）
    sh(`docker compose exec -T redis sh -c "redis-cli --scan --pattern 'rl:*demo-login*' | xargs -r redis-cli del"`);
    r = await api(p, "POST", "/auth/demo-login");
  }
  assert(r.status === 200, `お試しログインできない（${r.status}）`);
  return p;
}
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

// ── 準備 ─────────────────────────────────────────────
console.log("   " + sh("docker compose exec -T backend python -m app.cli restock-demo 200"));
const admin = await page();
await api(admin, "POST", "/auth/login", { email: "admin@hoshifuru.example", password: "admin12345" });
const before = (await api(admin, "GET", "/admin/settings")).body.values;
const setSetting = async (v) => {
  await api(admin, "PUT", "/admin/settings", v);
  await sleep(6000); // 設定は各サーバープロセスで最大 5 秒キャッシュされる
};
await setSetting({ video_ip_daily_limit: 0, register_ip_daily_limit: 0 });

// テスト用の完売ガチャ（表示順はいちばん上＝sort_order -1）
const SOLD = `qa-soldout-${RUN}`;
py(`
import asyncio
from app.core.db import SessionLocal
from app.models import Gacha, GachaItem, Prize
from sqlalchemy import select
async def m():
    async with SessionLocal() as db:
        p = await db.scalar(select(Prize).where(Prize.image_url == '/art/points/100.svg'))
        g = Gacha(slug='${SOLD}', title='QA完売ガチャ', ticket_cost=1, mode='box', status='published', sort_order=-1, banner_image_url='/images/waku/gacha-special.webp')
        db.add(g); await db.flush()
        db.add(GachaItem(gacha_id=g.id, prize_id=p.id, stock_total=5, stock_remaining=0))
        await db.commit()
asyncio.run(m())`);
await sleep(16000); // 一覧は API で 1 秒、ガチャ一覧の画面（サーバー側の取得）で最大 15 秒キャッシュされる

// ── 1. 完売したガチャは自動で下へ ───────────────────────
await step("1. 完売：API の一覧で、表示順がいちばん上でも完売はいちばん下", async () => {
  const list = (await api(admin, "GET", "/gachas")).body;
  assert(list.at(-1).slug === SOLD, `最後が完売ガチャでない（${list.map((g) => g.slug).join(", ")}）`);
  const firstSold = list.findIndex((g) => g.remaining === 0);
  assert(list.slice(firstSold).every((g) => g.remaining === 0), "完売の後ろに開催中のガチャがある");
});
await step("1. 完売：ガチャ一覧の画面で最後に表示され、「完売」とグレーの画像", async () => {
  const p = await page();
  await p.goto(BASE + "/gacha", { waitUntil: "networkidle" });
  const hrefs = await p.locator('main a[href^="/gacha/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const uniq = [...new Set(hrefs)];
  assert(uniq.at(-1) === `/gacha/${SOLD}`, `最後のカードが完売ガチャでない（${uniq.join(", ")}）`);
  const card = p.locator(`main a[href="/gacha/${SOLD}"]`).first();
  await card.scrollIntoViewIfNeeded();
  assert((await card.innerText()).includes("完売"), "カードに「完売」がない");
  assert(await card.locator("img.grayscale-\\[70\\%\\]").count(), "画像がグレーになっていない");
  await p.context().close();
});
await step("1. 完売：トップページのピックアップでも最後・「完売」表示", async () => {
  const p = await page();
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const sec = p.locator("section", { has: p.getByRole("heading", { name: "ピックアップガチャ" }) });
  const hrefs = [...new Set(await sec.locator('a[href^="/gacha/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href"))))].filter((h) => h !== "/gacha");
  assert(hrefs.at(-1) === `/gacha/${SOLD}`, `最後が完売ガチャでない（${hrefs.join(", ")}）`);
  assert((await sec.locator(`a[href="/gacha/${SOLD}"]`).first().innerText()).includes("完売"), "「完売」がない");
  await p.context().close();
});
await step("1. 完売：詳細ページでは引けない（PC・スマートフォン）", async () => {
  for (const opts of [{}, MOBILE]) {
    const p = await guest(opts);
    await p.goto(BASE + `/gacha/${SOLD}`, { waitUntil: "networkidle" });
    const btns = p.getByRole("button", { name: /ガチャを引く|1回/ });
    const n = await btns.count();
    assert(n > 0, "ボタンがない");
    for (let i = 0; i < n; i++) if (await btns.nth(i).isVisible()) assert(await btns.nth(i).isDisabled(), "完売なのにボタンが押せる");
    const r = await api(p, "POST", `/gachas/${(await api(p, "GET", `/gachas/${SOLD}`)).body.id}/draw`, { count: 1, idempotency_key: `qa-s-${RUN}-${opts.isMobile ? "m" : "d"}` });
    assert(r.status === 409, `API でも引けてしまう（${r.status}）`);
    await p.context().close();
  }
});

// ── 2. 「終了まで〜日」の表示なし ───────────────────────
await step("2. 終了日：デモのガチャに終了日がなく、一覧・詳細・トップに「終了まで」が出ない（PC・スマートフォン）", async () => {
  const list = (await api(admin, "GET", "/gachas")).body.filter((g) => !g.slug.startsWith("qa-"));
  assert(list.every((g) => !g.ends_at), `終了日が残っている（${list.filter((g) => g.ends_at).map((g) => g.slug)}）`);
  for (const opts of [{}, MOBILE]) {
    const p = await page(opts);
    for (const u of ["/", "/gacha", ...list.map((g) => `/gacha/${g.slug}`)]) {
      await p.goto(BASE + u, { waitUntil: "networkidle" });
      const t = await p.locator("main").innerText();
      assert(!/終了まで|あと\d+日|残り\d+日/.test(t), `${u} に終了までの表示がある`);
    }
    await p.context().close();
  }
});
await step("2. 終了日：管理画面のガチャ作成に「空欄推奨」の説明がある", async () => {
  await admin.goto(BASE + "/admin/gachas", { waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "新しいガチャを作成" }).click();
  await admin.getByRole("dialog").waitFor();
  assert((await admin.getByRole("dialog").innerText()).includes("空欄にすると「終了まで〜日」は表示されず"), "説明がない");
  await admin.keyboard.press("Escape");
});

// ── 3. 効果音 ───────────────────────────────────────────
let soundGuest;
await step("3. 効果音：1回引くと「ため」と「公開」の音が鳴る（軽量演出）", async () => {
  soundGuest = await guest({}, "lite");
  await soundGuest.goto(BASE + "/gacha/digital-gift", { waitUntil: "networkidle" });
  await soundGuest.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await soundGuest.getByRole("button", { name: "引く", exact: true }).click();
  await soundGuest.getByText(/おめでとう/).first().waitFor({ timeout: 30000 });
  const n = await soundGuest.evaluate(() => window.__osc);
  assert(n >= 6, `発音が少ない（${n} 回）`);
  return `発音 ${n} 回`;
});
await step("3. 効果音：画面左上のボタンでオフ → 保存され、次の抽選では鳴らない", async () => {
  await soundGuest.getByRole("button", { name: "効果音をオフにする" }).click();
  assert((await soundGuest.evaluate(() => localStorage.getItem("wk_sound"))) === "off", "保存されない");
  await soundGuest.goto(BASE + "/gacha/digital-gift", { waitUntil: "networkidle" });
  const n0 = await soundGuest.evaluate(() => window.__osc);
  await soundGuest.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await soundGuest.getByRole("button", { name: "引く", exact: true }).click();
  await soundGuest.getByText(/おめでとう/).first().waitFor({ timeout: 30000 });
  assert((await soundGuest.evaluate(() => window.__osc)) === n0, "オフなのに鳴った");
  await soundGuest.getByRole("button", { name: "効果音をオンにする" }).waitFor({ timeout: 3000 });
});
await step("3. 効果音：プロフィール設定に反映され、オンに戻して「試しに鳴らす」で鳴る", async () => {
  await soundGuest.goto(BASE + "/settings", { waitUntil: "networkidle" });
  const box = soundGuest.getByLabel("効果音を鳴らす");
  assert(!(await box.isChecked()), "オフの設定が反映されていない");
  assert(await soundGuest.getByRole("button", { name: "試しに鳴らす" }).isDisabled(), "オフなのに試せる");
  await box.check();
  const n0 = await soundGuest.evaluate(() => window.__osc);
  await soundGuest.getByRole("button", { name: "試しに鳴らす" }).click();
  await sleep(300);
  assert((await soundGuest.evaluate(() => window.__osc)) > n0, "鳴らない");
  assert((await soundGuest.evaluate(() => localStorage.getItem("wk_sound"))) === "on", "オンが保存されない");
});
await step("3. 効果音：10回引きでカードが 1 枚ずつめくれる音が鳴る", async () => {
  await soundGuest.goto(BASE + "/gacha/digital-gift", { waitUntil: "networkidle" });
  const n0 = await soundGuest.evaluate(() => window.__osc);
  await soundGuest.getByRole("button", { name: /^10回まとめて引く/ }).first().click();
  await soundGuest.getByRole("button", { name: "引く", exact: true }).click();
  await soundGuest.waitForURL(/\/play/);
  await soundGuest.getByRole("button", { name: /結果一覧|抽選結果の詳細/ }).first().waitFor({ timeout: 40000 });
  const d = (await soundGuest.evaluate(() => window.__osc)) - n0;
  assert(d >= 10 * 4, `めくる音が足りない（${d} 回）`); // めくる音 1 回 = 倍音 4 つ
  return `発音 ${d} 回`;
});
await step("3. 効果音：当選ランクの演出動画を流したときは、効果音を重ねない", async () => {
  const mp4 = path.join(root, ".demo/qa-effect.mp4");
  execSync(`ffmpeg -loglevel error -y -f lavfi -i "color=c=0xff3b7f:s=360x640:d=1" -f lavfi -i "sine=frequency=660:duration=1" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart ${mp4}`);
  const up = sh(`docker compose cp ${mp4} backend:/tmp/qa.mp4 && echo ok`);
  assert(up.endsWith("ok"), "動画をコピーできない");
  const url = py(`
import asyncio
from pathlib import Path
from app.core import storage
async def m():
    print(storage.save_video(Path('/tmp/qa.mp4').read_bytes(), 'effects'))
asyncio.run(m())`).split("\n").at(-1);
  const ranks = (await api(admin, "GET", "/admin/ranks")).body.items;
  for (const r of ranks) await api(admin, "PUT", `/admin/ranks/${r.rarity}`, { label: r.label, video_url: url, logo_url: null });
  await sleep(6000);
  try {
    const p = await guest({}, "lite");
    await p.goto(BASE + "/gacha/digital-gift", { waitUntil: "networkidle" });
    await p.getByRole("button", { name: /^ガチャを引く/ }).first().click();
    await p.getByRole("button", { name: "引く", exact: true }).click();
    await p.getByRole("button", { name: /タップして演出を見る/ }).click({ timeout: 20000 });
    await p.getByText(/おめでとう/).first().waitFor({ timeout: 20000 });
    const n = await p.evaluate(() => window.__osc);
    assert(n === 0, `動画のあとに効果音が鳴った（${n} 回）`);
    assert(!(await p.getByRole("button", { name: /効果音を/ }).count()), "動画のあとに効果音ボタンが出ている");
    await p.context().close();
  } finally {
    for (const r of ranks) await api(admin, "PUT", `/admin/ranks/${r.rarity}`, { label: r.label, video_url: r.video_url, logo_url: r.logo_url });
  }
});

// ── 4. キャラクター ─────────────────────────────────────
await step("4. キャラクター：トップの吹き出しが画面内に収まり、ボタンと重ならない（360〜1440px）", async () => {
  const bad = [];
  for (const w of [360, 390, 768, 1024, 1280, 1440]) {
    const p = await page({ viewport: { width: w, height: 900 } });
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await sleep(2200);
    const b = await p.locator(".dream-cloud").boundingBox();
    const cta = await p.getByRole("link", { name: /今すぐガチャを引く/ }).boundingBox();
    if (!b) bad.push(`${w}px:吹き出しがない`);
    else {
      if (b.x < 0 || b.x + b.width > w) bad.push(`${w}px:はみ出し(${Math.round(b.x)}〜${Math.round(b.x + b.width)})`);
      if (cta && !(b.y >= cta.y + cta.height || b.y + b.height < cta.y || b.x > cta.x + cta.width || b.x + b.width < cta.x)) bad.push(`${w}px:ボタンと重なる`);
    }
    if ((await p.evaluate(() => document.documentElement.scrollWidth)) > w) bad.push(`${w}px:横スクロール`);
    await p.context().close();
  }
  assert(!bad.length, bad.join(" / "));
});
await step("4. キャラクター：抽選中の画面・結果画面・空の一覧・404 に猫が表示される", async () => {
  const p = await guest(MOBILE);
  await p.route("**/api/gachas/*/draw", async (route) => {
    await sleep(1800);
    await route.continue();
  });
  await p.goto(BASE + "/gacha/digital-gift", { waitUntil: "networkidle" });
  await p.locator(".fixed button", { hasText: /1回/ }).first().click();
  await p.getByRole("button", { name: "引く", exact: true }).click();
  await p.getByText("ガチャを回しています…").waitFor({ timeout: 5000 });
  assert(await p.getByRole("img", { name: "サイトのキャラクターの猫" }).isVisible(), "抽選中に猫がいない");
  await p.getByText(/おめでとう/).first().waitFor({ timeout: 30000 });
  await p.goto(BASE + "/exchanges", { waitUntil: "networkidle" });
  assert(await p.locator('main img[src*="cat-face"]').first().isVisible(), "空の一覧に猫がいない");
  await p.goto(BASE + "/no-such-page-" + RUN, { waitUntil: "networkidle" });
  assert(await p.locator('img[src*="cat-face"]').first().isVisible(), "404 に猫がいない");
  await p.context().close();
});

// ── 5. 同じ Wi-Fi からの上限 ────────────────────────────
await step("5. 上限：管理画面のシステム設定に 2 つの上限と IP の保持日数があり、保存できる", async () => {
  await admin.goto(BASE + "/admin/settings", { waitUntil: "networkidle" });
  const t = await admin.locator("main").innerText();
  for (const k of ["video_ip_daily_limit", "register_ip_daily_limit", "ip_retention_days"]) assert(t.includes(k), `${k} がない`);
  const r = await api(admin, "PUT", "/admin/settings", { video_ip_daily_limit: 7 });
  assert(r.status === 200, "保存できない");
  await sleep(6000);
  assert((await api(admin, "GET", "/admin/settings")).body.values.video_ip_daily_limit === 7, "保存した値が返らない");
  await api(admin, "PUT", "/admin/settings", { video_ip_daily_limit: 0 });
});
await step("5. 上限：同じネットワークの別アカウントで動画が止まり、新規登録も止まる（画面に理由）", async () => {
  const a = await guest(),
    b = await guest();
  const video = (await api(a, "GET", "/offers")).body.find((o) => o.kind === "video");
  const s = await api(a, "POST", `/offers/${video.id}/start`);
  await api(a, "POST", `/offers/clicks/${s.body.click_id}/simulate`);
  await setSetting({ video_ip_daily_limit: 1, register_ip_daily_limit: 1 });
  const r = await api(b, "POST", `/offers/${video.id}/start`);
  assert(r.status === 409 && r.body.error.code === "video_ip_daily_limit", `別アカウントで開始できる（${r.status}）`);
  await b.goto(BASE + "/earn", { waitUntil: "networkidle" });
  await b.getByText("同じネットワーク（Wi-Fi など）からの視聴が今日の上限に達しました").first().waitFor({ timeout: 8000 });
  const reg1 = await api(b, "POST", "/auth/register", { email: `qa-fc1-${RUN}@example.com`, password: "qaPass123", display_name: "QA", agree_terms: true });
  const reg = await api(b, "POST", "/auth/register", { email: `qa-fc2-${RUN}@example.com`, password: "qaPass123", display_name: "QA", agree_terms: true });
  assert(reg1.status === 202 || reg1.status === 429, `1 件目の応答が想定外（${reg1.status}）`);
  assert(reg.status === 429 && reg.body.error.code === "register_ip_limit", `登録が止まらない（${reg.status}）`);
  await setSetting({ video_ip_daily_limit: 0, register_ip_daily_limit: 0 });
  await a.context().close();
  await b.context().close();
});

// ── 6. 同じ IP の会員（管理画面） ───────────────────────
await step("6. 管理画面：会員詳細に「同じ IP アドレスの会員」が表示され、閲覧が操作履歴に残る", async () => {
  const users = (await api(admin, "GET", "/admin/users?q=guest-&per_page=2")).body.items;
  const id = users[0].id;
  await admin.goto(BASE + `/admin/users/${id}`, { waitUntil: "networkidle" });
  await admin.getByRole("heading", { name: /同じ IP アドレスの会員/ }).waitFor({ timeout: 8000 });
  const t = await admin.locator("main").innerText();
  assert(t.includes("停止する前に"), "注意書きがない");
  assert(t.includes(String(users[1].id)) || t.includes("同じ IP アドレスを使った会員はいません"), "一覧が表示されない");
  const logs = (await api(admin, "GET", `/admin/audit-logs?action=user.view_same_ip&target_id=${id}`)).body.items;
  assert(logs.length >= 1, "操作履歴に残っていない");
  await admin.goto(BASE + "/admin/audit", { waitUntil: "networkidle" });
  assert((await admin.locator("main").innerText()).includes("user.view_same_ip"), "操作履歴の画面に出ない");
});

// ── 7. SNS で共有したときのカード ───────────────────────
await step("7. 共有カード：トップ・ガチャのページに画像・タイトル・説明（絶対 URL、1200×630）", async () => {
  const meta = (html, prop) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];
  const home = await (await fetch(BASE + "/")).text();
  for (const k of ["og:title", "og:description", "og:image", "og:site_name", "twitter:card", "twitter:image"]) assert(meta(home, k), `トップに ${k} がない`);
  assert(/^https?:\/\//.test(meta(home, "og:image")), "画像が絶対 URL でない");
  for (const slug of ["premium", "digital-gift", "special"]) {
    const h = await (await fetch(BASE + `/gacha/${slug}`)).text();
    assert(meta(h, "og:title")?.includes("｜わくわくガチャ"), `${slug}：タイトルがない`);
    assert(meta(h, "og:description")?.includes("1回 チケット1枚"), `${slug}：説明がない`);
    assert(/\.(jpe?g|png)$/.test(meta(h, "og:image") ?? ""), `${slug}：画像が JPEG・PNG でない（${meta(h, "og:image")}）`);
  }
  const size = sh(`python3 -c "from PIL import Image; print(Image.open('frontend/public/og.jpg').size)"`);
  assert(size === "(1200, 630)", `画像の大きさが違う（${size}）`);
});
await step("7. 共有カード：公開リンク（Cloudflare）経由でも、そのドメインの画像 URL になる", async () => {
  const link = sh("./scripts/demo-link.sh status").match(/https:\/\/[^（\s]+/)?.[0];
  if (!link) return "公開リンクなし（確認を省略）";
  const h = await (await fetch(link + "/")).text();
  const img = h.match(/<meta property="og:image" content="([^"]*)"/)?.[1] ?? "";
  assert(img.startsWith(link), `画像 URL が公開リンクでない（${img}）`);
  assert((await fetch(img)).status === 200, "画像が開けない");
});

// ── 8. ボタンの形（角丸なし・種類ごとに違う形） ─────────
await step("8. ボタン：会員・管理の主な画面で、角丸のボタンがなく、文字が切れていない（360px・1280px）", async () => {
  const bad = new Set();
  const shapes = new Set();
  const pages = ["/", "/gacha", "/gacha/digital-gift", "/shop", "/earn", "/mypage", "/settings", "/invite", "/prizes", "/draws", "/notifications", "/tickets", "/points", "/exchanges", "/contact"];
  for (const opts of [{ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true }, {}]) {
    const p = await guest(opts);
    for (const u of pages) {
      await p.goto(BASE + u, { waitUntil: "networkidle" });
      await sleep(400);
      const found = await p.evaluate(() => {
        const out = [];
        const els = [...document.querySelectorAll("button, a[class*='sh-'], a[class*='btn-'], [role='tab']")].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && !e.closest("[role='menu']");
        });
        for (const e of els) {
          const cs = getComputedStyle(e);
          const rounded = parseFloat(cs.borderTopLeftRadius) > 0.5 && cs.clipPath === "none" && cs.maskImage === "none" && cs.webkitMaskImage === "none";
          const label = (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 20);
          if (rounded) out.push({ t: "round", label });
          // 文字が枠の外にはみ出していないか（光の帯などの飾りは数えない）
          const rg = document.createRange();
          rg.selectNodeContents(e);
          const tr = rg.getBoundingClientRect(),
            br = e.getBoundingClientRect();
          if (tr.width > 0 && (tr.left < br.left - 1 || tr.right > br.right + 1)) out.push({ t: "cut", label });
          out.push({ t: "shape", label: cs.clipPath !== "none" ? cs.clipPath.slice(0, 40) : cs.maskImage !== "none" ? "mask" : "square" });
        }
        return out;
      });
      for (const f of found) {
        if (f.t === "shape") shapes.add(f.label);
        else bad.add(`${u}:${f.t === "round" ? "角丸" : "文字切れ"}「${f.label}」`);
      }
    }
    await p.context().close();
  }
  assert(!bad.size, [...bad].slice(0, 8).join(" / "));
  assert(shapes.size >= 8, `形の種類が少ない（${shapes.size}）`);
  return `形 ${shapes.size} 種類`;
});
await step("8. ボタン：キーボードで移動したとき、ボタンに目印（枠線）が見える", async () => {
  const p = await page();
  await p.goto(BASE + "/login", { waitUntil: "networkidle" });
  let ok = false;
  for (let i = 0; i < 25 && !ok; i++) {
    await p.keyboard.press("Tab");
    ok = await p.evaluate(() => {
      const e = document.activeElement;
      if (!e || !/sh-/.test(e.className)) return false;
      const cs = getComputedStyle(e);
      return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2;
    });
  }
  assert(ok, "フォーカスの目印が見えない");
  await p.context().close();
});

// ── 9. ログインボーナスの宝箱 ───────────────────────────
await step("9. 宝箱：光の層が動き、受け取るとふたが開いて金貨が飛び、チケットが増える（スマートフォン）", async () => {
  const p = await guest(MOBILE, "lite");
  await p.goto(BASE + "/mypage", { waitUntil: "networkidle" });
  const stage = p.locator(".bonus-stage");
  await stage.scrollIntoViewIfNeeded();
  const anims = await p.evaluate(() => document.querySelectorAll(".bonus-stage .chest-aura, .bonus-stage .chest-rays, .bonus-stage .chest-mote").length);
  assert(anims >= 10, `光の層が足りない（${anims}）`);
  const running = await p.evaluate(() => document.querySelector(".bonus-stage .chest-aura-a").getAnimations().length);
  assert(running > 0, "光が動いていない");
  const contained = await p.evaluate(() => getComputedStyle(document.querySelector(".bonus-stage")).overflow === "hidden");
  assert(contained, "光の筋が枠の外にはみ出す設定");
  const t0 = (await api(p, "GET", "/auth/me")).body.balance;
  await p.getByRole("button", { name: /宝箱を開けてチケット\d+枚を受け取る/ }).click();
  await sleep(350);
  assert(await p.locator(".chest-coin").count(), "金貨が飛ばない");
  const lid = await p.evaluate(() => document.querySelector(".bonus-stage .chest-lid").style.transform);
  assert(lid && lid !== "none", "ふたが開かない");
  await p.getByText("本日のお宝は受け取り済み。また明日！").waitFor({ timeout: 5000 });
  assert(await p.getByRole("button", { name: "本日は受け取り済みです" }).isDisabled(), "受け取り後もボタンが押せる");
  assert((await api(p, "GET", "/auth/me")).body.balance === t0 + 1, "チケットが増えない");
  const r = await api(p, "POST", "/rewards/daily");
  assert(r.status === 409, `同じ日に 2 回受け取れる（${r.status}）`);
  await p.context().close();
});
await step("9. 宝箱：ほかの画面の「受け取る」ボタン（小さな宝箱）からも受け取れ、閉じる（×）も効く", async () => {
  const p = await guest(MOBILE);
  await p.goto(BASE + "/earn", { waitUntil: "networkidle" });
  const btn = p.getByRole("button", { name: /本日のログインボーナス/ });
  await btn.waitFor({ timeout: 6000 });
  assert(await btn.locator(".chest").count(), "小さな宝箱がない");
  const sub = await btn.getByText("本日のログインボーナス").evaluate((e) => getComputedStyle(e).color);
  assert(!/rgba?\(\s*(1\d|2\d|3\d|[0-9]),/.test(sub), `小さな文字が背景と同じ暗い色（${sub}）`);
  const t0 = (await api(p, "GET", "/auth/me")).body.balance;
  await btn.click();
  await btn.waitFor({ state: "detached", timeout: 6000 });
  assert((await api(p, "GET", "/auth/me")).body.balance === t0 + 1, "チケットが増えない");
  const q = await guest(MOBILE);
  await q.goto(BASE + "/gacha/digital-gift", { waitUntil: "networkidle" });
  const rb = q.getByRole("button", { name: /本日のログインボーナス/ });
  await rb.waitFor({ timeout: 6000 });
  // ガチャのページでは「ガチャを引く」の帯と重ならない
  const a = await rb.boundingBox(),
    bar = await q.locator(".fixed button", { hasText: /1回/ }).first().boundingBox();
  assert(a.y + a.height <= bar.y, "受け取るボタンが「ガチャを引く」に重なっている");
  await q.getByRole("button", { name: "閉じる" }).click();
  await rb.waitFor({ state: "detached", timeout: 3000 });
  await p.context().close();
  await q.context().close();
});

// ── 10. プライバシーポリシー ─────────────────────────────
await step("10. プライバシーポリシー：IP アドレスの条（5 条）があり、条番号が 1〜13 の連番", async () => {
  const p = await page();
  await p.goto(BASE + "/privacy", { waitUntil: "networkidle" });
  const hs = await p.locator("main h2").allInnerTexts();
  const nums = hs.map((h) => parseInt(h)).filter((n) => !isNaN(n));
  assert(nums.join(",") === Array.from({ length: 13 }, (_, i) => i + 1).join(","), `条番号が連番でない（${nums.join(",")}）`);
  assert(hs[4].includes("IP アドレス"), `5 条が IP アドレスでない（${hs[4]}）`);
  const body = await p.locator("main").innerText();
  assert(body.includes("【90】日を経過したのち削除"), "保持期間の記載がない");
  await p.context().close();
});

// ── 後片付け ─────────────────────────────────────────────
await api(admin, "PUT", "/admin/settings", {
  video_ip_daily_limit: before.video_ip_daily_limit ?? 15,
  register_ip_daily_limit: before.register_ip_daily_limit ?? 3,
});
await step("画面のエラー・サーバーエラーがない", async () => {
  assert(!pageErrors.length, `画面のエラー：${pageErrors.slice(0, 2).join(" | ")}`);
  assert(!serverErrors.length, `サーバーエラー：${serverErrors.slice(0, 3).join(" | ")}`);
});
await browser.close();
console.log("   " + sh("docker compose exec -T backend python -m app.cli cleanup-test-data"));
const ng = results.filter((r) => !r.ok);
console.log(`\n結果：${results.length - ng.length} / ${results.length} 件 成功`);
process.exit(ng.length ? 1 : 0);
