import { expect, test as setup } from "@playwright/test";

setup("demo アカウントでログイン", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "demo@hoshifuru.example");
  await page.fill('input[type="password"]', "demo12345");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/mypage");
  await expect(page.getByText("マイページ").first()).toBeVisible();
  // 演出は「最小限」（結果表示までを検証）
  await page.evaluate(() => localStorage.setItem("hf_motion_level", "off"));
  await page.context().storageState({ path: "e2e/.auth/demo.json" });
});
