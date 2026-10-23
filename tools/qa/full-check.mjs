// 全機能の動作確認（実際のブラウザ＝Google Chrome で操作する）。
//   node tools/qa/full-check.mjs            （docker compose で起動中の http://localhost:3300 に対して実行）
// 開発・デモ環境専用：テスト用の会員を作り、設定を一時的に変更して最後に元へ戻す。本番には実行しないこと。
// 必要なもの：Google Chrome、Mailpit（http://localhost:8030）、docker compose（SMS の確認コードをログから読む）
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "frontend/package.json"));
const { chromium, devices } = require("@playwright/test");

const BASE = process.env.QA_BASE_URL || "http://localhost:3300";
const MAILPIT = "http://localhost:8030";
const RUN = Date.now().toString(36);
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? "", ms: Date.now() - t });
    console.log(`✅ ${name}${note ? `（${note}）` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, note: String(e.message || e).split("\n")[0].slice(0, 220), ms: Date.now() - t });
    console.log(`❌ ${name}：${String(e.message || e).split("\n")[0].slice(0, 220)}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ── 補助 ───────────────────────────────────────────────
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
async function mailLink(to, kind) {
  for (let i = 0; i < 20; i++) {
    const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json();
    for (const m of r.messages || []) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const link = full.Text.match(new RegExp(`https?://\\S+${kind}\\S*`));
      if (link) return link[0].replace(/^https?:\/\/[^/]+/, BASE);
    }
    await sleep(500);
  }
  throw new Error(`メールが届いていません（${to}）`);
}
function smsCode() {
  const logs = execSync("docker compose logs --since 2m backend 2>&1", { cwd: root }).toString();
  const all = [...logs.matchAll(/確認コード：(\d{6})/g)];
  if (!all.length) throw new Error("SMS の確認コードがログにありません");
  return all.at(-1)[1];
}
function py(code) {
  return execSync("docker compose exec -T backend python -", { cwd: root, input: code }).toString().trim();
}
async function newUserPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${page.url()} ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("hf_motion_level", "off"));
  return page;
}
async function register(page, email, name, ref) {
  await page.goto(BASE + (ref ? `/register?ref=${ref}` : "/register"), { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const form = page.locator("main form");
  await form.getByLabel("ニックネーム").fill(name);
  await form.getByLabel("メールアドレス").fill(email);
  await form.getByLabel("パスワード").fill("qaPass123");
  if (ref) assert((await form.getByLabel("招待コード（任意）").inputValue()) === ref.toUpperCase(), "招待リンクのコードが入力欄に入っていない");
  await form.locator('input[type="checkbox"]').check();
  await form.getByRole("button", { name: "登録して確認メールを受け取る" }).click();
  await page.getByText(/確認メールを送信しました|メールを確認/).first().waitFor({ timeout: 15000 });
  const link = await mailLink(email, "verify-email");
  await page.goto(link, { waitUntil: "load" });
  await page.getByText("さん、ようこそ").waitFor({ timeout: 15000 });
}
async function me(page) {
  return (await api(page, "GET", "/auth/me")).body;
}

const pageErrors = [];
const serverErrors = [];
const browser = await chromium.launch({ channel: "chrome" });

// 管理者
const admin = await newUserPage(browser);
await step("管理者でログイン", async () => {
  const r = await api(admin, "POST", "/auth/login", { email: "admin@hoshifuru.example", password: "admin12345" });
  assert(r.status === 200, `ログインできない（${r.status}）`);
});
const settingsBefore = (await api(admin, "GET", "/admin/settings")).body?.values ?? {};
// 設定は各サーバープロセスで最大 5 秒キャッシュされるため、変更後 6 秒待ってから確認する
const setSetting = async (v) => {
  const r = await api(admin, "PUT", "/admin/settings", v);
  await sleep(6000);
  return r;
};
// 確認はすべて同じ PC（同じ IP アドレス）から行うため、IP アドレスごとの上限は確認する手順以外では無効にしておく
await setSetting({ sms_verification_required: false, video_daily_limit: 2, signup_bonus_tickets: 10, signup_bonus_points: 1000, referral_inviter_tickets: 10, referral_invitee_tickets: 5, video_ip_daily_limit: 0, register_ip_daily_limit: 0 });

// ── 1. 公開ページ ───────────────────────────────────────
const guest = await newUserPage(browser);
await step("公開ページがすべて表示される（未ログイン）", async () => {
  const bad = [];
  for (const p of ["/", "/gacha", "/gacha/premium", "/gacha/digital-gift", "/gacha/special", "/shop", "/news", "/faq", "/terms", "/privacy", "/legal/tokushoho", "/contact", "/login", "/register", "/forgot-password"]) {
    const r = await guest.goto(BASE + p, { waitUntil: "load" });
    if (!r || r.status() >= 400) bad.push(`${p}:${r?.status()}`);
  }
  assert(!bad.length, bad.join(" "));
  return "15 画面";
});
await step("トップページ：キャッチコピー・ピックアップガチャ（1回 1枚）・景品・交換先", async () => {
  await guest.goto(BASE + "/", { waitUntil: "load" });
  const t = await guest.locator("main").innerText();
  for (const w of ["遊んで", "ピックアップガチャ", "豪華な景品ラインナップ", "遊び方", "人気のポイント交換先", "新規会員登録で", "いっしょにお宝をさがそう！"]) assert(t.includes(w), `「${w}」がない`);
  assert(/1回\s*1\s*枚/.test(t), "ガチャの価格が「1回 1枚」になっていない");
});
await step("未ログインでガチャを引く → 新規登録画面（特典を表示）→ 登録・メール確認のあと同じガチャへ戻れる", async () => {
  const p = await newUserPage(browser);
  await p.goto(BASE + "/gacha/digital-gift", { waitUntil: "load" });
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await p.waitForURL(/\/register\?next=%2Fgacha%2Fdigital-gift/, { timeout: 10000 });
  await p.getByText("ガチャを引くには、無料の会員登録が必要です。").waitFor({ timeout: 10000 });
  const banner = (await p.locator(".bonus-banner").innerText()).replace(/\s+/g, "");
  assert(banner.includes("1,000pt") && banner.includes("10枚"), `特典の表示が想定と違う（${banner}）`);
  const loginHref = await p.locator("main form").getByRole("link", { name: "ログイン", exact: true }).getAttribute("href");
  assert(loginHref === "/login?next=%2Fgacha%2Fdigital-gift", `ログインへのリンクに戻り先がない（${loginHref}）`);
  const email = `qa-g-${RUN}@example.com`;
  await p.waitForLoadState("networkidle").catch(() => {});
  const form = p.locator("main form");
  await form.getByLabel("ニックネーム").fill("QAゲスト");
  await form.getByLabel("メールアドレス").fill(email);
  await form.getByLabel("パスワード").fill("qaPass123");
  await form.locator('input[type="checkbox"]').check();
  await form.getByRole("button", { name: "登録して確認メールを受け取る" }).click();
  await p.getByText(/確認メールを送信しました/).first().waitFor({ timeout: 15000 });
  await p.goto(await mailLink(email, "verify-email"), { waitUntil: "load" });
  await p.getByText("さん、ようこそ").waitFor({ timeout: 15000 });
  const back = await p.getByRole("link", { name: "さっそくガチャを引く" }).getAttribute("href");
  assert(back === "/gacha/digital-gift", `確認後の戻り先が違う（${back}）`);
  await p.context().close();
});

await step("SNS で共有したときのカード（画像・タイトル）と、ガチャに「終了まで」の表示がない", async () => {
  const html = await (await fetch(BASE + "/")).text();
  const meta = (prop) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];
  assert(/^https?:\/\/.+\/og\.jpg$/.test(meta("og:image") ?? ""), `og:image が絶対 URL でない（${meta("og:image")}）`);
  assert(meta("twitter:card") === "summary_large_image", "twitter:card がない");
  assert((await fetch(BASE + "/og.jpg")).status === 200, "共有用の画像が表示できない");
  const gh = await (await fetch(BASE + "/gacha/digital-gift")).text();
  assert(gh.includes('property="og:title" content="デジタルギフトガチャ｜'), "ガチャのページの共有タイトルがない");
  await guest.goto(BASE + "/gacha/digital-gift", { waitUntil: "load" });
  assert(!(await guest.locator("main").innerText()).includes("終了まで"), "「終了まで」が表示されている");
});

// ── 2. 会員登録・メール確認・ログイン・パスワード再設定 ────────────
const A = await newUserPage(browser);
const emailA = `qa-a-${RUN}@example.com`;
await step("会員登録 → 確認メール → リンクで確認完了（特典：チケット10枚・1,000pt）", async () => {
  await register(A, emailA, "QAテストA");
  const m = await me(A);
  assert(m.email_verified && m.balance === 10 && m.point_balance === 1000, `残高が想定と違う（チケット${m.balance}・${m.point_balance}pt）`);
});
await step("確認済みのリンクをもう一度開くと「確認済み」と表示（ログインはされない）", async () => {
  const link = await mailLink(emailA, "verify-email");
  const p = await newUserPage(browser);
  await p.goto(link, { waitUntil: "load" });
  await p.getByText("このメールアドレスは確認済みです").waitFor({ timeout: 10000 });
  assert((await api(p, "GET", "/auth/me")).status === 401, "使用済みのリンクでログインできてしまう");
  await p.context().close();
});
await step("ログアウト → ログイン画面からログイン", async () => {
  await api(A, "POST", "/auth/logout");
  await A.goto(BASE + "/login", { waitUntil: "load" });
  await A.waitForLoadState("networkidle").catch(() => {});
  const form = A.locator("main form").filter({ has: A.locator('input[type="password"]') });
  await form.locator('input[type="email"]').fill(emailA);
  await form.locator('input[type="password"]').fill("qaPass123");
  await form.locator('button[type="submit"]').click();
  await A.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  assert((await me(A))?.email === emailA, "ログインできていない");
});
await step("パスワードを忘れた → 再設定メール → 新しいパスワードでログイン", async () => {
  const p = await newUserPage(browser);
  await p.goto(BASE + "/forgot-password", { waitUntil: "load" });
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.locator("main").getByLabel("メールアドレス").fill(emailA);
  await p.getByRole("button", { name: "再設定メールを送信" }).click();
  await sleep(1500);
  const link = await mailLink(emailA, "reset-password");
  await p.goto(link, { waitUntil: "load" });
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.locator('input[type="password"]').nth(0).fill("qaPass456");
  await p.locator('input[type="password"]').nth(1).fill("qaPass456");
  await p.getByRole("button", { name: "パスワードを再設定する" }).click();
  await sleep(1500);
  const r = await api(p, "POST", "/auth/login", { email: emailA, password: "qaPass456" });
  assert(r.status === 200, `新しいパスワードでログインできない（${r.status}）`);
  await p.context().close();
  await api(A, "POST", "/auth/login", { email: emailA, password: "qaPass456" });
});

// ── 3. 友達紹介 ─────────────────────────────────────────
let inviteCode = "";
await step("友達紹介：招待コードが表示される", async () => {
  await A.goto(BASE + "/invite", { waitUntil: "load" });
  inviteCode = (await api(A, "GET", "/invite")).body.invite_code;
  await A.getByText(inviteCode).first().waitFor({ timeout: 10000 });
  return inviteCode;
});
const B = await newUserPage(browser);
const emailB = `qa-b-${RUN}@example.com`;
await step("招待リンクから登録 → 双方にチケット（紹介した人 +10・された人 +5）", async () => {
  const before = (await me(A)).balance;
  await register(B, emailB, "QAテストB", inviteCode.toLowerCase());
  const b = await me(B);
  assert(b.balance === 10 + 5, `紹介された人のチケットが ${b.balance}（期待 15）`);
  const a = await me(A);
  assert(a.balance === before + 10, `紹介した人のチケットが ${a.balance}（期待 ${before + 10}）`);
  const inv = (await api(A, "GET", "/invite")).body;
  assert(inv.invited === 1 && inv.completed === 1, "紹介人数の表示が違う");
});

// ── 4. チケット獲得 ──────────────────────────────────────
await step("ログインボーナス（マイページ）", async () => {
  const before = (await me(A)).balance;
  await A.goto(BASE + "/mypage", { waitUntil: "load" });
  await A.getByRole("button", { name: /チケット\d+枚を受け取る/ }).first().click();
  await A.getByText(/本日は受け取り済み|ログインボーナス：/).first().waitFor({ timeout: 10000 });
  assert((await me(A)).balance === before + 1, "ログインボーナスが加算されていない");
});
await step("広告案件：成果通知でチケットが加算される（開発用の模擬通知）", async () => {
  const offers = (await api(A, "GET", "/offers")).body;
  const ad = offers.find((o) => o.kind !== "video" && o.earned_count < o.per_user_limit);
  assert(ad, "挑戦できる広告案件がない");
  const before = (await me(A)).balance;
  const s = await api(A, "POST", `/offers/${ad.id}/start`);
  const sim = await api(A, "POST", `/offers/clicks/${s.body.click_id}/simulate`);
  assert(sim.body?.outcome === "credited", `成果が付与されない（${JSON.stringify(sim.body)}）`);
  assert((await me(A)).balance === before + ad.reward_tickets, "チケットの加算額が違う");
});
await step("動画リワード広告：1日の上限（2回に設定）で、画面のボタンが押せなくなる", async () => {
  const video = (await api(A, "GET", "/offers")).body.find((o) => o.kind === "video");
  assert(video, "動画案件がない");
  for (let i = 0; i < 2; i++) {
    const s = await api(A, "POST", `/offers/${video.id}/start`);
    assert(s.status === 200, `開始できない（${s.status}）`);
    await api(A, "POST", `/offers/clicks/${s.body.click_id}/simulate`);
  }
  const third = await api(A, "POST", `/offers/${video.id}/start`);
  assert(third.status === 409 && third.body.error.code === "video_daily_limit", "上限を超えても開始できてしまう");
  await A.goto(BASE + "/earn", { waitUntil: "load" });
  await A.getByRole("button", { name: "今日の上限に達しました" }).first().waitFor({ timeout: 10000 });
  await A.getByText("今日の視聴 2/2回").first().waitFor({ timeout: 5000 });
});
await step("複数アカウント対策：同じネットワーク（IP）からの動画視聴は、別のアカウントでも合計の上限で止まる", async () => {
  await setSetting({ video_ip_daily_limit: 2 }); // A がこの IP から 2 回視聴済み
  const video = (await api(B, "GET", "/offers")).body.find((o) => o.kind === "video");
  assert(video.ip_limit_reached === true && video.daily_used === 0, `B の表示が想定と違う（${JSON.stringify(video)}）`);
  const r = await api(B, "POST", `/offers/${video.id}/start`);
  assert(r.status === 409 && r.body.error.code === "video_ip_daily_limit", `別アカウントで開始できてしまう（${r.status}）`);
  await B.goto(BASE + "/earn", { waitUntil: "load" });
  await B.getByText("同じネットワーク（Wi-Fi など）からの視聴が今日の上限に達しました").first().waitFor({ timeout: 10000 });
  await B.getByRole("button", { name: "今日の上限に達しました" }).first().waitFor({ timeout: 5000 });
  await setSetting({ video_ip_daily_limit: 0 });
  assert((await api(B, "GET", "/offers")).body.find((o) => o.kind === "video").ip_limit_reached === false, "0 にしても制限が解除されない");
});
await step("複数アカウント対策：同じネットワーク（IP）からの新規登録は 1 日の上限で止まり、画面に理由が出る", async () => {
  await setSetting({ register_ip_daily_limit: 1 }); // この IP からは今日すでに登録済み
  const p = await newUserPage(browser);
  await p.goto(BASE + "/register", { waitUntil: "load" });
  await p.waitForLoadState("networkidle").catch(() => {});
  const form = p.locator("main form");
  await form.getByLabel("ニックネーム").fill("QA複垢");
  await form.getByLabel("メールアドレス").fill(`qa-ip-${RUN}@example.com`);
  await form.getByLabel("パスワード").fill("qaPass123");
  await form.locator('input[type="checkbox"]').check();
  await form.getByRole("button", { name: "登録して確認メールを受け取る" }).click();
  await p.getByText("同じネットワーク（Wi-Fi など）からの新規登録が、今日の上限に達しました").waitFor({ timeout: 10000 });
  await p.context().close();
  await setSetting({ register_ip_daily_limit: 0 });
});

// ── 5. クーポンコード ────────────────────────────────────
await step("クーポン（使い捨て型）：管理画面で発行 → マイページで入力 → チケット加算・2回目は不可", async () => {
  const r = await api(admin, "POST", "/admin/coupons", { kind: "single", tickets: 7, count: 2, note: "QA" });
  const code = r.body.items[0].code;
  const before = (await me(A)).balance;
  await A.goto(BASE + "/mypage", { waitUntil: "load" });
  await A.getByLabel("クーポンコード").fill(code.toLowerCase());
  await A.getByRole("button", { name: "受け取る", exact: true }).click();
  await A.getByText("チケット7枚を受け取りました").first().waitFor({ timeout: 10000 });
  assert((await me(A)).balance === before + 7, "クーポンのチケットが加算されていない");
  const again = await api(B, "POST", "/coupons/redeem", { code });
  assert(again.body?.error?.code === "coupon_used_up", "使い捨てのコードを別の人が使えてしまう");
});
await step("クーポン（先着型）：先着1名・1人1回", async () => {
  const code = `QA${RUN}`.toUpperCase().slice(0, 16);
  await api(admin, "POST", "/admin/coupons", { kind: "shared", tickets: 3, code, max_uses: 1 });
  assert((await api(A, "POST", "/coupons/redeem", { code })).status === 200, "先着1人目が使えない");
  assert((await api(B, "POST", "/coupons/redeem", { code })).body?.error?.code === "coupon_used_up", "先着の上限を超えて使えてしまう");
});

// ── 6. ガチャ ────────────────────────────────────────────
await step("ガチャ 1回：画面から引く → 結果表示、チケット −1、当たったポイントが加算", async () => {
  await api(admin, "POST", `/admin/users/${(await me(A)).id}/tickets`, { delta: 150, reason: "QA", idempotency_key: `qa-t-${RUN}` });
  const m0 = await me(A);
  await A.goto(BASE + "/gacha/digital-gift", { waitUntil: "load" });
  await A.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await A.getByRole("button", { name: "引く", exact: true }).click();
  await A.getByText("獲得した景品").waitFor({ timeout: 30000 });
  // 効果音のオン・オフ（ブラウザに保存）と、キャラクターの吹き出し
  await A.getByText(/おめでとう/).first().waitFor({ timeout: 5000 });
  await A.getByRole("button", { name: "効果音をオフにする" }).click();
  await A.getByRole("button", { name: "効果音をオンにする" }).waitFor({ timeout: 3000 });
  assert((await A.evaluate(() => localStorage.getItem("wk_sound"))) === "off", "効果音の設定が保存されない");
  await A.getByRole("button", { name: "効果音をオンにする" }).click();
  const m1 = await me(A);
  assert(m1.balance === m0.balance - 1, `チケットが ${m0.balance - m1.balance} 枚減った（期待 1）`);
  const d = (await api(A, "GET", "/draws?per_page=1")).body.items[0];
  assert(m1.point_balance === m0.point_balance + (d.points_won || 0), "当たったポイントが残高に加算されていない");
  return `獲得 ${d.points_won || 0}pt`;
});
await step("ガチャ 10回・100回まとめて：チケット −10・−100、結果 10件・100件", async () => {
  // 表示用のガチャの口数を使い切らないよう、テスト専用のガチャ（200 口）で確認する
  const multiSlug = `qa-multi-${RUN}`;
  py(`
import asyncio
from app.core.db import SessionLocal
from app.models import Gacha, GachaItem, Prize
from sqlalchemy import select
async def m():
    async with SessionLocal() as db:
        p = await db.scalar(select(Prize).where(Prize.image_url == '/art/points/100.svg'))
        g = Gacha(slug='${multiSlug}', title='QAまとめ引き', ticket_cost=1, mode='box', status='published', sort_order=98)
        db.add(g); await db.flush()
        db.add(GachaItem(gacha_id=g.id, prize_id=p.id, stock_total=200, stock_remaining=200))
        await db.commit()
asyncio.run(m())`);
  for (const n of [10, 100]) {
    const m0 = await me(A);
    const g = (await api(A, "GET", `/gachas/${multiSlug}`)).body;
    const r = await api(A, "POST", `/gachas/${g.id}/draw`, { count: n, idempotency_key: `qa-${n}-${RUN}` });
    assert(r.status === 200, `${n}回引けない（${JSON.stringify(r.body?.error)}）`);
    assert(r.body.results.length === n, `結果が ${r.body.results.length} 件`);
    const m1 = await me(A);
    assert(m1.balance === m0.balance - n, `${n}回でチケットが ${m0.balance - m1.balance} 枚減った`);
    assert(m1.point_balance === m0.point_balance + r.body.points_won, `${n}回の当選ポイントが残高と合わない`);
  }
  await A.goto(BASE + "/draws", { waitUntil: "load" });
  await A.getByText("QAまとめ引き").first().waitFor({ timeout: 10000 });
  py(`
import asyncio
from app.core.db import SessionLocal
from app.models import Gacha
from sqlalchemy import update
async def m():
    async with SessionLocal() as db:
        await db.execute(update(Gacha).where(Gacha.slug == '${multiSlug}').values(status='archived')); await db.commit()
asyncio.run(m())`);
});
await step("同じ抽選を2回送っても、チケットは1回分だけ（二重送信の防止）", async () => {
  const g = (await api(A, "GET", "/gachas/premium")).body;
  const m0 = await me(A);
  const key = `qa-dup-${RUN}`;
  const [r1, r2] = await Promise.all([api(A, "POST", `/gachas/${g.id}/draw`, { count: 1, idempotency_key: key }), api(A, "POST", `/gachas/${g.id}/draw`, { count: 1, idempotency_key: key })]);
  assert(r1.status === 200 && r2.status === 200 && r1.body.id === r2.body.id, "同じ抽選が別々に実行された");
  assert((await me(A)).balance === m0.balance - 1, "チケットが二重に消費された");
});
await step("ラストワン賞：残り3口のガチャで最後の1口を引くと確定画面が出る", async () => {
  const slug = `qa-lastone-${RUN}`;
  py(`
import asyncio
from app.core.db import SessionLocal
from app.models import Gacha, GachaItem, Prize
from sqlalchemy import select
async def m():
    async with SessionLocal() as db:
        p = await db.scalar(select(Prize).where(Prize.image_url == '/art/points/100.svg'))
        lo = await db.scalar(select(Prize).where(Prize.image_url == '/art/prizes/lastone_orb.svg'))
        g = Gacha(slug='${slug}', title='QAラストワン', ticket_cost=1, mode='box', status='published', last_one_prize_id=lo.id, sort_order=99)
        db.add(g); await db.flush()
        db.add(GachaItem(gacha_id=g.id, prize_id=p.id, stock_total=3, stock_remaining=3))
        await db.commit()
asyncio.run(m())`);
  const g = (await api(A, "GET", `/gachas/${slug}`)).body;
  await api(A, "POST", `/gachas/${g.id}/draw`, { count: 1, idempotency_key: `qa-lo1-${RUN}` });
  await api(A, "POST", `/gachas/${g.id}/draw`, { count: 1, idempotency_key: `qa-lo2-${RUN}` });
  await A.goto(BASE + `/gacha/${slug}`, { waitUntil: "load" });
  await A.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await A.getByRole("button", { name: "引く", exact: true }).click();
  await A.waitForURL(/\/play/, { timeout: 15000 });
  let d = null;
  for (let i = 0; i < 30 && !(d && d.gacha_id === g.id && d.has_last_one); i++) {
    await sleep(500);
    d = (await api(A, "GET", "/draws?per_page=1")).body.items[0];
  }
  await A.getByText("ラストワン賞").first().waitFor({ timeout: 15000 });
  assert(d.has_last_one, "ラストワン賞が付与されていない");
  const sold = await api(A, "POST", `/gachas/${g.id}/draw`, { count: 1, idempotency_key: `qa-lo4-${RUN}` });
  assert(sold.status === 409, "完売後も引けてしまう");
  // 完売したガチャは一覧のいちばん下へ
  await sleep(1200);
  const list = (await api(A, "GET", "/gachas")).body;
  const firstSold = list.findIndex((x) => x.remaining === 0);
  assert(firstSold >= 0 && list.slice(firstSold).every((x) => x.remaining === 0), `完売したガチャが下に移動していない（${list.map((x) => x.slug + ":" + x.remaining).join(", ")}）`);
  py(`
import asyncio
from app.core.db import SessionLocal
from app.models import Gacha
from sqlalchemy import update
async def m():
    async with SessionLocal() as db:
        await db.execute(update(Gacha).where(Gacha.slug == '${slug}').values(status='archived')); await db.commit()
asyncio.run(m())`);
});

// ── 7. SMS 認証（交換・発送の前のみ） ──────────────────────────
await setSetting({ sms_verification_required: true });
await step("SMS 認証を必須にしても、ガチャは SMS なしで引ける", async () => {
  const g = (await api(B, "GET", "/gachas/digital-gift")).body;
  const r = await api(B, "POST", `/gachas/${g.id}/draw`, { count: 1, idempotency_key: `qa-sms-d-${RUN}` });
  assert(r.status === 200, `ガチャが引けない（${JSON.stringify(r.body?.error)}）`);
});
await step("ポイント交換しようとすると SMS 認証の画面へ → 番号入力 → コード確認 → 交換できる", async () => {
  await B.goto(BASE + "/shop", { waitUntil: "load" });
  const card = B.locator(".glass", { hasText: "デジコ 500円分" }).first();
  await api(admin, "POST", `/admin/users/${(await me(B)).id}/points`, { delta: 10000, reason: "QA", idempotency_key: `qa-p-${RUN}` });
  await B.reload({ waitUntil: "load" });
  await card.getByRole("button", { name: "交換する" }).click();
  await B.getByText("電話番号の確認（SMS 認証）をお願いします").waitFor({ timeout: 5000 });
  await B.getByRole("dialog").getByRole("button", { name: "交換する" }).click();
  await B.waitForURL((u) => u.pathname === "/verify-phone", { timeout: 10000 });
  const phone = `090${String(Date.now()).slice(-8)}`;
  await B.getByLabel("携帯電話番号").fill(phone);
  await B.getByRole("button", { name: "確認コードを送信" }).click();
  await B.getByText(/6 桁の確認コードを送りました/).waitFor({ timeout: 10000 });
  await sleep(800);
  await B.getByLabel("確認コード（6 桁）").fill(smsCode());
  await B.getByRole("button", { name: "確認する" }).click();
  await B.waitForURL((u) => u.pathname === "/shop", { timeout: 15000 });
  assert((await me(B)).phone_verified, "電話番号が確認済みになっていない");
  await B.locator(".glass", { hasText: "デジコ 500円分" }).first().getByRole("button", { name: "交換する" }).click();
  await B.getByRole("dialog").getByRole("button", { name: "交換する" }).click();
  await B.getByRole("dialog", { name: /交換が完了しました|交換を受け付けました/ }).waitFor({ timeout: 10000 });
});
await setSetting({ sms_verification_required: false });

// ── 8. ポイント交換（ギフトコード・手動発行・発送・取消） ──────────────
let pendingOrder = null;
await step("ポイント交換：コード在庫あり→即時お渡し／在庫なし→受付（ポイントが減る）", async () => {
  const items = (await api(A, "GET", "/shop/items")).body;
  const instant = items.find((i) => i.instant);
  const noStock = items.find((i) => i.kind === "digital_code" && !i.instant && i.point_cost <= 10000);
  await api(admin, "POST", `/admin/users/${(await me(A)).id}/points`, { delta: 30000, reason: "QA", idempotency_key: `qa-p2-${RUN}` });
  const p0 = (await me(A)).point_balance;
  if (instant) {
    const r = await api(A, "POST", "/shop/orders", { item_id: instant.id, idempotency_key: `qa-o1-${RUN}` });
    assert(r.status === 200 && r.body.status === "fulfilled" && r.body.gift_code, "在庫のコードがお渡しされない");
  }
  const r2 = await api(A, "POST", "/shop/orders", { item_id: noStock.id, idempotency_key: `qa-o2-${RUN}` });
  assert(r2.status === 200 && r2.body.status === "pending", "在庫なしの申請が受付にならない");
  pendingOrder = r2.body;
  const spent = (instant ? instant.point_cost : 0) + noStock.point_cost;
  assert((await me(A)).point_balance === p0 - spent, "ポイントの減り方が違う");
});
await step("管理画面：受付中の申請にコードを入力してお渡し → 会員の交換履歴にコードが表示", async () => {
  await admin.goto(BASE + "/admin/shop/orders", { waitUntil: "load" });
  await admin.getByRole("button", { name: "対応する" }).first().click();
  await admin.getByLabel("ギフトコード").fill(`QA-MANUAL-${RUN}`);
  await admin.getByRole("button", { name: "お渡しする" }).click();
  await admin.getByText("この申請は対応済みです").waitFor({ timeout: 10000 });
  const mine = (await api(A, "GET", "/shop/orders")).body.items;
  assert(mine.some((o) => o.gift_code === `QA-MANUAL-${RUN}`), "会員の履歴にコードが出ない");
  await A.goto(BASE + "/shop/orders", { waitUntil: "load" });
  await A.getByRole("button", { name: "ギフトコードを表示" }).first().click();
  await A.getByText(/QA-MANUAL-|TEST-DGC-/).first().waitFor({ timeout: 5000 });
});
await step("発送する景品：住所を入力して交換 → 取消でポイントが戻る", async () => {
  const sw = (await api(A, "GET", "/shop/items")).body.find((i) => i.kind === "shipping");
  await api(admin, "POST", `/admin/users/${(await me(A)).id}/points`, { delta: sw.point_cost, reason: "QA", idempotency_key: `qa-p3-${RUN}` });
  const p0 = (await me(A)).point_balance;
  const ship = { name: "山田 太郎", postal_code: "100-0001", prefecture: "東京都", address1: "千代田区千代田1-1", address2: "", phone: "090-1234-5678", note: "" };
  const r = await api(A, "POST", "/shop/orders", { item_id: sw.id, idempotency_key: `qa-o3-${RUN}`, shipping: ship });
  assert(r.status === 200 && r.body.status === "pending" && r.body.recipient_masked === "山田 ●●", `発送の申請ができない（${JSON.stringify(r.body?.error)}）`);
  assert((await me(A)).point_balance === p0 - sw.point_cost, "ポイントが減っていない");
  await A.goto(BASE + "/shop/orders", { waitUntil: "load" });
  A.once("dialog", (d) => d.accept());
  await A.getByRole("button", { name: "取り消す" }).first().click();
  await sleep(1500);
  assert((await me(A)).point_balance === p0, "取消でポイントが戻らない");
});

// ── 9. 景品の発送申請（ガチャで当たった物の景品） ─────────────────────
await step("当たった景品の発送申請 → 管理画面で承認・発送", async () => {
  let owned = (await api(A, "GET", "/prizes?status=owned&per_page=200")).body.items;
  if (!owned.length) {
    const g = (await api(A, "GET", "/gachas/premium")).body;
    await api(A, "POST", `/gachas/${g.id}/draw`, { count: 100, idempotency_key: `qa-own-${RUN}` });
    owned = (await api(A, "GET", "/prizes?status=owned&per_page=200")).body.items;
  }
  assert(owned.length, "発送できる景品がない（ガチャで物の景品が当たらなかった）");
  const ship = { name: "山田 太郎", postal_code: "100-0001", prefecture: "東京都", address1: "千代田区千代田1-1", address2: "", phone: "090-1234-5678", note: "" };
  const r = await api(A, "POST", "/exchanges", { user_prize_ids: [owned[0].id], shipping: ship, idempotency_key: `qa-ex-${RUN}` });
  assert(r.status === 201, `申請できない（${r.status} ${JSON.stringify(r.body?.error)}）`);
  for (const status of ["approved", "preparing", "shipped"]) {
    const t = await api(admin, "POST", `/admin/exchanges/${r.body.id}/status`, { status, carrier: "ヤマト運輸", tracking_number: "1234-5678-9012" });
    assert(t.status === 200, `「${status}」にできない（${t.status}）`);
  }
  await A.goto(BASE + `/exchanges/${r.body.id}`, { waitUntil: "load" });
  await A.getByText("発送済み").first().waitFor({ timeout: 10000 });
});

// ── 10. 当選ランクの演出動画 ─────────────────────────────────
await step("管理画面：当選ランクに演出動画をアップロード → ガチャで「タップして演出を見る」→ 再生 → 結果", async () => {
  const mp4 = path.join(root, ".demo/qa-effect.mp4");
  execSync(`ffmpeg -loglevel error -y -f lavfi -i "color=c=0xff3b7f:s=360x640:d=2" -f lavfi -i "sine=frequency=660:duration=2" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart ${mp4}`);
  await admin.goto(BASE + "/admin/ranks", { waitUntil: "load" });
  for (let i = 0; i < 4; i++) {
    const panel = admin.locator("section").filter({ has: admin.locator('input[type="file"][accept="video/mp4"]') }).nth(i);
    await panel.locator('input[type="file"][accept="video/mp4"]').setInputFiles(mp4);
    await panel.locator("video").waitFor({ timeout: 15000 });
    await panel.getByRole("button", { name: "保存する" }).click();
    await sleep(800);
  }
  // 当選ランクの設定は各サーバープロセスで最大 5 秒キャッシュされるため、反映を待つ
  let ranks = [];
  for (let i = 0; i < 16 && !(ranks.length && ranks.every((r) => r.video_url)); i++) {
    if (i) await sleep(500);
    ranks = (await api(A, "GET", "/ranks")).body;
  }
  assert(ranks.every((r) => r.video_url), "動画が保存されていない");
  results.push({ name: "（演出動画：管理画面で 4 ランクに保存）", ok: true, note: "", ms: 0 });
  console.log("   … 管理画面での保存 OK、スマートフォンでガチャを引きます");
  await sleep(6000); // すべてのサーバープロセスで当選ランクのキャッシュ（最大 5 秒）が切り替わるのを待つ
  const mobile = await newUserPage(browser, { ...devices["Pixel 7"] });
  await api(mobile, "POST", "/auth/login", { email: emailA, password: "qaPass456" });
  await mobile.evaluate(() => localStorage.setItem("hf_motion_level", "auto"));
  await mobile.goto(BASE + "/gacha/digital-gift", { waitUntil: "load" });
  await mobile.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await mobile.getByRole("button", { name: "引く", exact: true }).click();
  const tap = mobile.getByRole("button", { name: /タップして演出を見る/ });
  await tap.waitFor({ timeout: 20000 });
  await tap.click({ force: true });
  await sleep(800);
  const v = await mobile.evaluate(() => { const e = document.querySelector("video"); return e && { paused: e.paused, muted: e.muted, h: e.videoHeight }; });
  assert(v && !v.paused && v.h === 640, `動画が再生されていない（${JSON.stringify(v)}）`);
  await mobile.getByText("獲得した景品").waitFor({ timeout: 15000 });
  await mobile.context().close();
  for (const r of ranks) await api(admin, "PUT", `/admin/ranks/${r.rarity}`, { label: r.label, video_url: null, logo_url: null });
  return "Chrome・スマートフォン表示";
});
await step("ランクの表示名（特賞・大当たり・中当たり・小当たり）がサイトに表示される", async () => {
  await A.goto(BASE + "/gacha/digital-gift", { waitUntil: "load" });
  const t = await A.locator("main").innerText();
  assert(["特賞", "大当たり", "中当たり", "小当たり"].some((w) => t.includes(w)), "ランク名が表示されていない");
  assert(!/\bSSR\b/.test(t), "画面に SSR などの内部名が残っている");
});

// ── 11. 会員の各画面・お問い合わせ ────────────────────────────
await step("会員の画面がすべて表示される", async () => {
  const bad = [];
  for (const p of ["/mypage", "/tickets", "/points", "/shop", "/shop/orders", "/prizes", "/exchanges", "/draws", "/notifications", "/invite", "/verify-phone", "/settings", "/earn"]) {
    const r = await A.goto(BASE + p, { waitUntil: "load" });
    await sleep(400);
    if (!r || r.status() >= 400) bad.push(`${p}:${r?.status()}`);
  }
  assert(!bad.length, bad.join(" "));
  return "13 画面";
});
await step("お問い合わせフォームの送信", async () => {
  await A.goto(BASE + "/contact", { waitUntil: "load" });
  await A.waitForLoadState("networkidle").catch(() => {});
  const cf = A.locator("main form");
  await cf.getByLabel("お名前").fill("QAテスト");
  await cf.getByLabel("メールアドレス").fill(emailA);
  await cf.getByLabel("お問い合わせ内容").fill("動作確認のための問い合わせです。");
  await A.getByRole("button", { name: "送信する" }).click();
  await A.getByText(/受け付けました|送信しました|ありがとうございます/).first().waitFor({ timeout: 10000 });
});
await step("通知：紹介・クーポン・ギフトコードなどのお知らせが届いている", async () => {
  const n = (await api(A, "GET", "/notifications")).body;
  const items = n.items ?? n;
  const titles = items.map((x) => x.title).join(" / ");
  for (const w of ["お友達が登録しました", "クーポン", "ギフトコード"]) assert(titles.includes(w), `通知「${w}」がない`);
});

// ── 12. 管理画面 ─────────────────────────────────────────
await step("管理画面がすべて表示される", async () => {
  const bad = [];
  for (const p of ["/admin", "/admin/users", "/admin/tickets", "/admin/gachas", "/admin/prizes", "/admin/inventory", "/admin/last-one", "/admin/ranks", "/admin/draws", "/admin/offers", "/admin/exchanges", "/admin/shop/orders", "/admin/shop", "/admin/referrals", "/admin/coupons", "/admin/messages", "/admin/audit", "/admin/settings"]) {
    const r = await admin.goto(BASE + p, { waitUntil: "load" });
    await sleep(500);
    const t = await admin.locator("main").innerText().catch(() => "");
    if (!r || r.status() >= 400 || /エラーが発生しました/.test(t)) bad.push(p);
  }
  assert(!bad.length, bad.join(" "));
  return "18 画面";
});
await step("管理画面：会員詳細でチケット・ポイントの付与（画面から）", async () => {
  const id = (await me(B)).id;
  const t0 = (await me(B)).balance;
  await admin.goto(BASE + `/admin/users/${id}`, { waitUntil: "load" });
  // 複数アカウントの確認：同じ IP アドレスの会員（この確認は同じ PC から行うため、A などが表示される）
  await admin.getByRole("heading", { name: /同じ IP アドレスの会員/ }).waitFor({ timeout: 10000 });
  const sameIp = (await api(admin, "GET", `/admin/users/${id}/same-ip`)).body;
  assert(sameIp.items.some((x) => x.id === (sameIp.items[0]?.id)) && sameIp.items.length > 0, "同じ IP アドレスの会員が表示されない");
  await admin.getByRole("button", { name: "チケット付与・調整" }).click();
  await admin.getByLabel("増減するチケット枚数").fill("3");
  await admin.getByLabel(/理由/).fill("QA テスト");
  await admin.getByRole("button", { name: "3枚を付与する" }).click();
  await sleep(1500);
  assert((await me(B)).balance === t0 + 3, "チケットが付与されていない");
});
await step("管理画面：メッセージ配信（1人へ）が会員の通知に届く", async () => {
  const id = (await me(B)).id;
  const r = await api(admin, "POST", "/admin/messages", { target_type: "users", user_ids: [id], title: `QAメッセージ${RUN}`, body: "テストです", send_email: false });
  assert(r.status < 300, `送信できない（${r.status} ${JSON.stringify(r.body?.error || r.body?.detail)}）`);
  const n = (await api(B, "GET", "/notifications")).body;
  assert((n.items ?? n).some((x) => x.title === `QAメッセージ${RUN}`), "会員の通知に届いていない");
});

// ── 13. スマートフォン表示の横はみ出し ───────────────────────────
await step("スマートフォン（360px）で横にはみ出す画面がない", async () => {
  const p = await newUserPage(browser, { viewport: { width: 360, height: 780 } });
  await api(p, "POST", "/auth/login", { email: emailA, password: "qaPass456" });
  const bad = [];
  for (const u of ["/", "/gacha", "/gacha/digital-gift", "/shop", "/shop/orders", "/mypage", "/points", "/tickets", "/earn", "/invite", "/verify-phone", "/draws", "/prizes", "/news", "/faq"]) {
    await p.goto(BASE + u, { waitUntil: "load" });
    await sleep(500);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > 361) bad.push(`${u}:${sw}`);
  }
  // 残高が多い場合（チケット 9,999 枚・99,999pt）でもヘッダーがはみ出さないこと
  await p.route("**/api/auth/me", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    await route.fulfill({ response: r, json: { ...j, balance: 9999, point_balance: 99999 } });
  });
  await p.goto(BASE + "/mypage", { waitUntil: "load" });
  await sleep(800);
  const swMax = await p.evaluate(() => document.documentElement.scrollWidth);
  if (swMax > 361) bad.push(`残高が多い場合:${swMax}`);
  await p.context().close();
  assert(!bad.length, bad.join(" "));
});

// ── 後片付け ─────────────────────────────────────────────
await setSetting({
  sms_verification_required: settingsBefore.sms_verification_required ?? false,
  video_daily_limit: settingsBefore.video_daily_limit ?? 5,
  video_ip_daily_limit: settingsBefore.video_ip_daily_limit ?? 15,
  register_ip_daily_limit: settingsBefore.register_ip_daily_limit ?? 3,
});
await step("ブラウザのエラー・サーバーエラーがない", async () => {
  assert(!pageErrors.length, `画面のエラー ${pageErrors.length} 件：${pageErrors.slice(0, 2).join(" | ")}`);
  assert(!serverErrors.length, `サーバーエラー ${serverErrors.length} 件：${serverErrors.slice(0, 3).join(" | ")}`);
});
await browser.close();

const ng = results.filter((r) => !r.ok);
console.log(`\n結果：${results.length - ng.length} / ${results.length} 件 成功`);
process.exit(ng.length ? 1 : 0);
