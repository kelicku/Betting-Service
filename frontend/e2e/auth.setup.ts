import { expect, test as setup } from "@playwright/test";

setup("demo アカウントでログイン", async ({ page }) => {
  await page.goto("/login");
  // 画面の準備（React の読み込み）が終わる前に入力すると消えるため、入力値が残るまで繰り返す
  const form = page.locator("main form").filter({ has: page.locator('input[type="password"]') });
  await expect(async () => {
    await form.locator('input[type="email"]').fill("demo@hoshifuru.example");
    await form.locator('input[type="password"]').fill("demo12345");
    await expect(form.locator('input[type="email"]')).toHaveValue("demo@hoshifuru.example", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await form.locator('button[type="submit"]').click();
  await page.waitForURL("**/mypage");
  await expect(page.getByText("マイページ").first()).toBeVisible();
  // 演出は「最小限」（結果表示までを検証）
  await page.evaluate(() => localStorage.setItem("hf_motion_level", "off"));
  await page.context().storageState({ path: "e2e/.auth/demo.json" });
});
