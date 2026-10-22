import { defineConfig, devices } from "@playwright/test";

// 前提：バックエンド（シード済み）とフロントエンドが起動していること
//   E2E_BASE_URL（既定 http://localhost:3300）
// ログインのレート制限に掛からないよう、ログインは setup で 1 回だけ行い、セッションを再利用する。
const auth = "e2e/.auth/demo.json";
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  // シードの共有アカウントを使うため直列実行（並列だと残高の比較が干渉する）
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL || "http://localhost:3300", trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], storageState: auth }, dependencies: ["setup"] },
    { name: "mobile", use: { ...devices["Pixel 7"], storageState: auth }, dependencies: ["setup"] },
  ],
});
