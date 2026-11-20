import { defineConfig, devices } from "@playwright/test";

// End-to-end against the real stack: the Java backend (already running, see support/require-api.ts) and the
// production build of the web app. The societies are created by the tests themselves, through the interface or the API.
export default defineConfig({
  testDir: "./e2e-real",
  globalSetup: "./e2e-real/support/require-api.ts",
  expect: { timeout: 10_000 },
  // Tests share one database: they run one after the other, in file order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", locale: "it-IT", timezoneId: "Europe/Rome" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
