import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";

// 何度も実行するとチケットが減っていくため、少なくなったら管理者で補充する（開発環境の初期データの管理者）
async function topUpTickets(page: import("@playwright/test").Page, userId: number) {
  const ctx = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  const admin = await ctx.newPage();
  await admin.goto("/");
  await admin.evaluate(async (id) => {
    await fetch("/api/auth/csrf");
    const t = () => document.cookie.match(/hf_csrf=([^;]+)/)?.[1] ?? "";
    const post = (u: string, b: unknown) => fetch("/api" + u, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": t() }, body: JSON.stringify(b) });
    await post("/auth/login", { email: "admin@hoshifuru.example", password: "admin12345" });
    await post(`/admin/users/${id}/tickets`, { delta: 200, reason: "E2E テスト用の補充", idempotency_key: `e2e-${Date.now()}` });
  }, userId);
  await ctx.close();
}

setup("demo アカウントでログイン", async ({ page }) => {
  // デモ用ガチャの口数が少なくなっていたら補充する（開発環境の管理コマンド）
  try {
    execSync("docker compose exec -T backend python -m app.cli restock-demo 100", { cwd: path.resolve(__dirname, "../.."), stdio: "ignore" });
  } catch {
    /* docker を使っていない環境では補充しない */
  }
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
  const me = await page.evaluate(async () => (await fetch("/api/auth/me")).json());
  if (me.balance < 50) await topUpTickets(page, me.id);
  // 演出は「最小限」（結果表示までを検証）
  await page.evaluate(() => localStorage.setItem("hf_motion_level", "off"));
  await page.context().storageState({ path: "e2e/.auth/demo.json" });
});
