// トップページを参考画像と同じ比率で撮影する（node tools/compare/capture.mjs [URL] [出力先]）
// 演出は「最小限」にして静止状態を撮る。フロントエンドの node_modules の Playwright を使う。
// DESIGN=waku（既定）：わくわくガチャの参考画像用。LOGIN=メール:パスワード でログイン状態を撮る（参考画像はログイン中の表示）
// DESIGN=hoshifuru：旧デザイン（星降る宝物殿）用
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "frontend/package.json"));
const { chromium } = require("@playwright/test");

const url = process.argv[2] || "http://localhost:3300/";
const out = process.argv[3] || path.join(root, "tools/compare/out/current-1440.png");
const width = Number(process.env.WIDTH || 1440);
const design = process.env.DESIGN || "waku";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: "load" });
if (process.env.LOGIN) {
  const [email, password] = process.env.LOGIN.split(":");
  const status = await p.evaluate(async ({ email, password }) => {
    await fetch("/api/auth/csrf", { credentials: "include" });
    const tok = document.cookie.match(/hf_csrf=([^;]+)/)?.[1];
    const r = await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": tok }, body: JSON.stringify({ email, password }) });
    return r.status;
  }, { email, password });
  if (status !== 200) throw new Error(`login failed: ${status}`);
}
await p.evaluate(() => localStorage.setItem("hf_motion_level", "off"));
await p.reload({ waitUntil: "load" });
await p.waitForTimeout(2500);
// 遅延読み込みの画像を読み込ませるため、一度最下部までスクロールしてから戻る
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await p.waitForTimeout(1500);
await p.addStyleTag({ content: "*{animation:none!important;transition:none!important} .bonus-reminder,.paw-stamp{display:none!important}" });
await p.screenshot({ path: out, fullPage: true });
// セクションの位置（比較時に参考画像の各セクションと対応づける）
const boxes = await p.evaluate((design) => {
  const q = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top + scrollY), Math.round(b.bottom + scrollY)]; };
  const H = document.documentElement.scrollHeight;
  if (design === "waku") {
    const hero = q("section[aria-label='メインビジュアル']");
    const s = (id) => { const e = document.getElementById(id)?.closest("section"); const b = e.getBoundingClientRect(); return [Math.round(b.top + scrollY), Math.round(b.bottom + scrollY)]; };
    const pickup = s("pickup-title"), lineup = s("lineup-title"), howto = s("howto-title"), exchange = s("exchange-title");
    const footer = q("footer");
    return { header: [0, 84], hero: [84, hero[1]], promo: [hero[1], pickup[0]], pickup: [pickup[0], lineup[0]], lineup: [lineup[0], howto[0]], howto: [howto[0], exchange[0]], exchange: [exchange[0], footer ? footer[0] : H] };
  }
  const hero = q("section[aria-label='メインビジュアル']");
  const banners = q("section[aria-label='キャンペーン']");
  const features = q("section[aria-label='宝物殿の楽しみ方']");
  const gacha = q("section[aria-label='おすすめのガチャ']");
  const prizes = q("#featured-prizes");
  const news = q("section[aria-label='お知らせ・はじめての方へ']");
  const footer = q("footer");
  return { header: [0, 81], hero: [81, hero[1]], banners: [hero[1], features[0]], features: [features[0], gacha[0]], gacha: [gacha[0], prizes[0]], prizes: [prizes[0], news[0]], news: [news[0], footer[0]], footer: [footer[0], H] };
}, design);
const fs = await import("node:fs");
fs.writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify(boxes, null, 2));
const h = await p.evaluate(() => document.documentElement.scrollHeight);
console.log(`captured ${out} (${width}x${h})`);
await b.close();
