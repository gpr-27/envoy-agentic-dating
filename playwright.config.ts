import { defineConfig, devices } from "@playwright/test";

/** Local E2E: runs the app with MOCK_EXTERNALS=1 (synthetic scrapes, mock LLM) on a throwaway store. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "rm -rf .data/e2e && npx next dev -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          MOCK_EXTERNALS: "1",
          SUPABASE_URL: "",
          SUPABASE_SERVICE_ROLE_KEY: "",
          FILE_STORE_PATH: ".data/e2e/db.json",
          TICK_BUDGET_MS: "8000",
        },
      },
});
