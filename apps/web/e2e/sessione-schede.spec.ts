import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { meWith } from "./support/route-api";

const CORS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-headers": "authorization,content-type,idempotency-key",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};

/**
 * Backend that behaves like the real one on the point that matters here: the refresh token rotates on every renewal
 * and presenting an old one revokes the whole session. "Expiring" bumps the valid access token only.
 */
async function sessionBackend(context: BrowserContext) {
  const state = { accessGeneration: 1, refreshGeneration: 1, revoked: false, refreshCalls: 0 };
  const session = () => ({
    accessToken: `access-${state.accessGeneration}`,
    refreshToken: `refresh-${state.refreshGeneration}`,
    tokenType: "Bearer",
    expiresIn: 900,
  });
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const respond = (status: number, body?: unknown) =>
      route.fulfill({
        status,
        headers: { ...CORS, "content-type": status >= 400 ? "application/problem+json" : "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, "");

    if (path === "/auth/refresh") {
      state.refreshCalls += 1;
      const { refreshToken } = request.postDataJSON() as { refreshToken: string };
      if (state.revoked || refreshToken !== `refresh-${state.refreshGeneration}`) {
        state.revoked = true;
        return respond(401, { type: "about:blank", title: "Unauthorized", status: 401, code: "unauthorized" });
      }
      state.accessGeneration += 1;
      state.refreshGeneration += 1;
      return respond(200, session());
    }
    if (path === "/auth/logout") return respond(204);
    if (request.headers().authorization !== `Bearer access-${state.accessGeneration}`) {
      return respond(401, { type: "about:blank", title: "Unauthorized", status: 401, code: "unauthorized" });
    }
    if (path === "/me") return respond(200, meWith({ roles: ["ADMIN"], permissions: ["members:read"] }));
    if (path === "/notifications/unread-count") return respond(200, { count: 0 });
    if (path === "/members/summary") return respond(200, { tesserati: 0, squadre: 0, documentiMancanti: 0 });
    return respond(200, { data: [], page: { nextCursor: null, hasMore: false } });
  });
  return state;
}

/** A returning user: the refresh token is in storage (only when empty, so a reload never overwrites a rotated one). */
async function seedSession(context: BrowserContext) {
  await context.addInitScript(() => {
    if (window.localStorage.getItem("suiteasd.refreshToken") === null) {
      window.localStorage.setItem("suiteasd.refreshToken", "refresh-1");
    }
  });
}

async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();
}

test.describe("two tabs of the same browser", () => {
  test("both survive the access token expiring together, with a single renewal", async ({ context }) => {
    const backend = await sessionBackend(context);
    await seedSession(context);
    const first = await context.newPage();
    await openHome(first);
    const second = await context.newPage();
    await openHome(second);
    // Whatever restoring the session cost, from here on only the renewals caused by the expiry count
    await expect.poll(() => backend.refreshCalls).toBeGreaterThanOrEqual(1);
    const before = backend.refreshCalls;

    backend.accessGeneration += 1; // the access token of both tabs expires now

    // Each tab asks the API for something at the same moment
    await Promise.all([
      first.getByRole("navigation", { name: "Sezioni" }).getByRole("link", { name: "Tesserati" }).click(),
      second.getByRole("navigation", { name: "Sezioni" }).getByRole("link", { name: "Tesserati" }).click(),
    ]);

    await expect(first).toHaveURL(/\/tesserati/);
    await expect(second).toHaveURL(/\/tesserati/);
    await expect(first.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(second.getByRole("heading", { level: 1 })).toBeVisible();
    expect(backend.refreshCalls - before).toBe(1);
    expect(backend.revoked).toBe(false);
    expect(first.url()).not.toContain("/login");
    expect(second.url()).not.toContain("/login");
  });

  test("a logout in one tab sends the other one to /login", async ({ context }) => {
    await sessionBackend(context);
    await seedSession(context);
    const first = await context.newPage();
    await openHome(first);
    const second = await context.newPage();
    await openHome(second);

    await first.getByRole("button", { name: "Esci" }).click();
    await expect(first).toHaveURL(/\/login/);
    await expect(second).toHaveURL(/\/login/);
  });

  test("a login in one tab signs the other one in", async ({ context }) => {
    await sessionBackend(context);
    const first = await context.newPage();
    const second = await context.newPage();
    await second.goto("/login");
    await expect(second.getByRole("heading", { level: 1, name: "Bentornato" })).toBeVisible();

    // The first tab gets a session (here: it was seeded elsewhere and announced like a login would be)
    await first.goto("/login");
    await expect(first.getByRole("heading", { level: 1, name: "Bentornato" })).toBeVisible();
    await first.evaluate(() => {
      new BroadcastChannel("suiteasd.session").postMessage({
        type: "tokens",
        accessToken: "access-1",
        refreshToken: "refresh-1",
        origin: "login",
      });
      window.localStorage.setItem("suiteasd.refreshToken", "refresh-1");
    });

    await expect(second).toHaveURL("http://localhost:3000/");
    await expect(second.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();
  });
});
