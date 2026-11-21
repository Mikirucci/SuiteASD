import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-real",
  globalSetup: "./e2e-real/support/require-api.ts",
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:8081", trace: "retain-on-failure", locale: "it-IT", timezoneId: "Europe/Rome" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
