import { defineConfig, devices } from "@playwright/test";

// End-to-end against the real stack: the API on a seeded throwaway database and the production build of the web app.
export default defineConfig({
  testDir: "./e2e-real",
  expect: { timeout: 10_000 },
  // Tests share one database: they run one after the other, in file order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", locale: "it-IT", timezoneId: "Europe/Rome" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e-real/support/start-api.mjs",
      url: "http://localhost:4000/api/v1/health",
      // Never adopt a developer's API: it would run against their own database.
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command: "npm run build && npm run start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
