import { expect, test } from "@playwright/test";

// demo アカウントのセッションは auth.setup.ts で作成済み（演出は「最小限」）
// 参考デザインの表示データ（python -m app.cli showcase）の「デジタルギフトガチャ」（1回 チケット1枚）で確認する
const GACHA = "/gacha/digital-gift";
const COST = 1;
const balanceOf = async (page: import("@playwright/test").Page, label = /所持チケット/) =>
  Number((await page.getByLabel(label).locator("visible=true").first().getAttribute("aria-label"))?.match(/[\d,]+/)?.[0].replace(/,/g, ""));

async function login(page: import("@playwright/test").Page) {
  await page.goto("/mypage");
  await expect(page.getByLabel(/所持チケット/).locator("visible=true").first()).toBeVisible();
}

test("トップページにキャッチコピーとピックアップガチャが表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("遊んで貯めて");
  await expect(page.getByRole("heading", { name: "ピックアップガチャ" })).toBeVisible();
});

test("未ログインでガチャを引こうとすると新規登録画面へ（特典を表示し、ログインへも進める）", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: undefined })).newPage();
  await page.goto(GACHA);
  await page.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await expect(page).toHaveURL(/\/register\?next=%2Fgacha%2F/);
  await expect(page.getByText("ガチャを引くには、無料の会員登録が必要です。")).toBeVisible();
  await expect(page.locator(".bonus-banner")).toBeVisible();
  await expect(page.locator("form").getByRole("link", { name: "ログイン", exact: true })).toHaveAttribute("href", /\/login\?next=%2Fgacha%2F/);
});

test("ログインしてガチャを引くとポイントが消費され結果が表示される", async ({ page }) => {
  await login(page);
  const before = await balanceOf(page);
  await page.goto(GACHA);
  await page.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await page.getByRole("button", { name: "引く", exact: true }).click();
  await expect(page.getByText("獲得した景品")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "抽選結果の詳細" }).click();
  await expect(page.getByRole("heading", { name: "抽選結果" })).toBeVisible();
  expect(await balanceOf(page)).toBe(before - COST);
});

test("再読み込みしても同じ抽選が二重に実行されない", async ({ page }) => {
  await login(page);
  await page.goto(GACHA);
  await page.getByRole("button", { name: /^ガチャを引く/ }).first().click();
  await page.getByRole("button", { name: "引く", exact: true }).click();
  await page.waitForURL("**/play**");
  await expect(page.getByText("獲得した景品")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  // 実行済みのキーは結果画面へ誘導される
  await expect(page).toHaveURL(/\/draws\//, { timeout: 20_000 });
});

test("トップページのガチャカードから、そのガチャの詳細画面へ移動する", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("a.gacha-frame").first();
  await card.scrollIntoViewIfNeeded();
  const href = await card.getAttribute("href");
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test("ポイント交換：デジタルギフトと交換すると、ポイントが減り、コードが表示される（在庫がなければ受付）", async ({ browser }) => {
  // 毎回新しいお試しアカウント（チケット 30 枚・10,000pt）で確認する（共有のデモ会員のポイントを減らさない）
  const page = await (await browser.newContext({ storageState: undefined })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "ワンクリックでログイン" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/shop");
  await expect(page.getByLabel(/所持ポイント/).locator("visible=true").first()).toBeVisible();
  const before = await balanceOf(page, /所持ポイント/);
  const card = page.locator(".glass", { hasText: "デジコ 500円分" }).first();
  await card.getByRole("button", { name: "交換する" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "交換する" }).click();
  const done = page.getByRole("dialog", { name: /交換が完了しました|交換を受け付けました/ });
  await expect(done).toBeVisible();
  if (await page.getByRole("dialog", { name: "交換が完了しました" }).count()) {
    await expect(page.getByText(/^TEST-DGC-[\d-]+-NOTREAL$/)).toBeVisible();
  }
  await expect.poll(() => balanceOf(page, /所持ポイント/)).toBe(before - 5000);
});
