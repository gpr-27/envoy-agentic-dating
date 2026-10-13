import { defineConfig, devices } from "@playwright/test";

/** Production E2E against the deployed site: BASE_URL=https://… npm run e2e:prod */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 600_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
