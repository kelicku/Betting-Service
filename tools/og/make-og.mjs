// SNS で共有したときの画像（1200×630、frontend/public/og.jpg）を作る。サイト名を変えたら作り直す。
//   node tools/og/make-og.mjs ["サイト名"]   （docker compose で起動中の http://localhost:3300 の画像・フォントを使う）
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { chromium } = createRequire(path.join(root, "frontend/package.json"))("playwright");
const BASE = process.env.QA_BASE_URL || "http://localhost:3300";
const name = process.argv[2] || "わくわくガチャ";

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;900&display=block">
<style>
  body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:"M PLUS Rounded 1c",sans-serif}
  .bg{position:absolute;inset:0;background:url(${BASE}/images/waku/hero-bg-jp.webp) center top/cover}
  .haze{position:absolute;left:-80px;top:40px;width:820px;height:560px;background:radial-gradient(ellipse 50% 50% at 50% 50%,rgba(255,255,255,.85),rgba(255,255,255,.5) 45%,transparent 72%)}
  .cat{position:absolute;right:-10px;bottom:-30px;width:600px;filter:drop-shadow(0 18px 30px rgba(120,60,140,.35))}
  .t{position:absolute;left:64px;top:110px}
  h1{margin:0;font-size:104px;font-weight:900;letter-spacing:-.04em;line-height:1.05;
     background:linear-gradient(90deg,#ff3d9a,#ff9a00 40%,#2f8fff 70%,#a43dff);-webkit-background-clip:text;color:transparent;
     -webkit-text-stroke:0;filter:drop-shadow(0 0 6px #fff) drop-shadow(0 0 2px #fff) drop-shadow(0 4px 0 rgba(123,63,214,.35))}
  p{margin:22px 0 0;font-size:44px;font-weight:900;color:#1b2252;text-shadow:0 0 6px #fff,0 0 12px #fff}
  .pill{display:inline-block;margin-top:30px;padding:12px 34px;border-radius:999px;font-size:34px;font-weight:900;color:#fff;
        background:linear-gradient(180deg,#ff5d8f,#f0215e);box-shadow:0 0 0 4px #fff,0 10px 20px -8px rgba(240,33,94,.8)}
</style></head><body>
<div class="bg"></div><div class="haze"></div>
<img class="cat" src="${BASE}/images/waku/hero-cat.webp">
<div class="t"><h1>${name}</h1><p>遊んで貯めて、<br>好きなギフトに交換！</p><span class="pill">新規登録で特典プレゼント</span></div>
</body></html>`;

const br = await chromium.launch({ channel: "chrome" });
const page = await br.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const out = path.join(root, "frontend/public/og.jpg");
await page.screenshot({ path: out });
await br.close();
console.log("作成しました：", out);
