import { expect, test, type Page } from "@playwright/test";
import { ALL_NOTIFICATIONS, preferences } from "../src/features/notifiche/test-fixtures";
import type { AppNotification, NotificationPreference } from "../src/features/notifiche/types";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiHandler } from "./support/route-api";

const ME = { permissions: ["notifications:readOwn"], roles: ["ATLETA"] };
const READ_AT = "2026-11-09T10:00:00.000Z";

/** Lets enter animations (tabs) finish so the colour contrast check reads the final colours. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

/** Backend of the module: reading changes rows and counter, preferences are stored, like the real API. */
function notificationsBackend(options: { listFailures?: number } = {}) {
  const state = { rows: ALL_NOTIFICATIONS as AppNotification[], prefs: preferences() as NotificationPreference[], listFailures: options.listFailures ?? 0 };
  const handler: ApiHandler = ({ method, path, query, body }) => {
    const readOne = /^\/notifications\/([^/]+)\/read$/.exec(path);
    if (method === "POST" && readOne) {
      state.rows = state.rows.map((row) => (row.id === readOne[1] ? { ...row, readAt: row.readAt ?? READ_AT } : row));
      return { body: state.rows.find((row) => row.id === readOne[1]) };
    }
    switch (`${method} ${path}`) {
      case "GET /notifications": {
        if (state.listFailures > 0) {
          state.listFailures -= 1;
          return { status: 500, body: { type: "about:blank", title: "Internal Server Error", status: 500, code: "internal" } };
        }
        const unreadOnly = query.get("unread") === "true";
        const type = query.get("type");
        return pageOf(state.rows.filter((row) => (!unreadOnly || row.readAt === null) && (!type || row.type === type)));
      }
      case "GET /notifications/unread-count":
        return { body: { count: state.rows.filter((row) => row.readAt === null).length } };
      case "POST /notifications/read-all": {
        const updated = state.rows.filter((row) => row.readAt === null).length;
        state.rows = state.rows.map((row) => ({ ...row, readAt: row.readAt ?? READ_AT }));
        return { body: { updated } };
      }
      case "GET /notifications/preferences":
        return { body: { preferences: state.prefs } };
      case "PUT /notifications/preferences": {
        const changes = (body as { preferences: NotificationPreference[] }).preferences;
        state.prefs = state.prefs.map((item) => changes.find((change) => change.type === item.type && change.channel === item.channel) ?? item);
        return { body: { preferences: state.prefs } };
      }
      default:
        return undefined;
    }
  };
  return { state, handler };
}

async function open(page: Page, backend = notificationsBackend()) {
  await mockApi(page);
  const api = await routeApi(page, ME, backend.handler);
  await seedStoredSession(page);
  await page.goto("/area-personale/notifiche");
  return { api, backend };
}

test.describe("notifiche", () => {
  test("shows the notification center with read state, without accessibility violations", async ({ page }) => {
    await open(page);

    await expect(page.getByRole("heading", { level: 1, name: /Avvisi a tutti, al momento giusto/ })).toBeVisible();
    const list = page.getByRole("list", { name: "Notifiche", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByRole("listitem").filter({ hasText: "Convocazione" })).toContainText("Non letta");
    await expect(list.getByRole("listitem").filter({ hasText: "Pagella pubblicata" })).not.toContainText("Non letta");
    await expect(page.getByText("2 notifiche da leggere")).toBeVisible();

    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("marks one notification as read, then all of them", async ({ page }) => {
    const { api } = await open(page);
    const list = page.getByRole("list", { name: "Notifiche", exact: true });

    await page.getByRole("button", { name: "Segna come letta: Quota in scadenza" }).click();
    await expect(page.getByText("1 notifica da leggere")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: "Quota in scadenza" })).not.toContainText("Non letta");
    expect(api.calls).toContain("POST /notifications/n-fee/read");

    await page.getByRole("button", { name: "Segna tutte come lette" }).click();
    await expect(page.getByText("Sei in pari: nessuna notifica da leggere.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Segna tutte come lette" })).toHaveCount(0);
    await expect(page.getByText("Notifiche segnate come lette")).toBeVisible();
    expect(api.calls).toContain("POST /notifications/read-all");
  });

  test("keeps the unread badge of the navigation in step with what is read", async ({ page }) => {
    await open(page);
    const sidebar = page.getByRole("navigation", { name: "Sezioni" });

    const link = sidebar.getByRole("link", { name: "Notifiche 2 da leggere" });
    await expect(link).toBeVisible();
    await expect(link).toContainText("2");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Segna come letta: Quota in scadenza" }).click();
    await expect(sidebar.getByRole("link", { name: "Notifiche 1 da leggere" })).toBeVisible();

    await page.getByRole("button", { name: "Segna tutte come lette" }).click();
    await expect(sidebar.getByRole("link", { name: "Notifiche", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /da leggere/ })).toHaveCount(0);
  });

  test("shows no badge to a visitor who is not signed in", async ({ page }) => {
    await mockApi(page);
    const api = await routeApi(page, ME, notificationsBackend().handler);
    await page.goto("/notifiche");

    await expect(page).toHaveURL(/login/);
    expect(api.calls).not.toContain("GET /notifications/unread-count");
  });

  test("filters by read state and by type", async ({ page }) => {
    await open(page);
    const list = page.getByRole("list", { name: "Notifiche", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(3);

    await page.getByRole("button", { name: "Non lette", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).not.toContainText("Pagella pubblicata");

    await page.getByLabel("Tipo di notifica").selectOption({ label: "Quote in scadenza" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Quota in scadenza");

    await page.getByLabel("Tipo di notifica").selectOption({ label: "Pagelle pubblicate" });
    await expect(page.getByRole("heading", { name: "Nessuna notifica con questi filtri" })).toBeVisible();
    await page.getByRole("button", { name: "Azzera i filtri" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
  });

  test("saves the channel preferences per notification type", async ({ page }) => {
    const { api, backend } = await open(page);
    await page.getByRole("tab", { name: "Preferenze" }).click();

    await expect(page.getByRole("heading", { name: "Dove ricevere gli avvisi" })).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(14);
    const email = page.getByRole("switch", { name: "Email per Convocazioni" });
    await expect(email).toBeChecked();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await email.click();
    await expect(email).not.toBeChecked();
    await expect.poll(() => backend.state.prefs.find((item) => item.type === "CONVOCATION" && item.channel === "EMAIL")?.enabled).toBe(false);
    expect(api.bodies.get("PUT /notifications/preferences")).toEqual({
      preferences: [{ type: "CONVOCATION", channel: "EMAIL", enabled: false }],
    });
    await expect(page.getByRole("switch", { name: "Nell'app per Convocazioni" })).toBeChecked();
    await expect(email).not.toBeChecked();
  });

  test("shows an error with a retry button when the list cannot be loaded", async ({ page }) => {
    // React Query retries a failing GET twice: the third answer is the one the user sees
    await open(page, notificationsBackend({ listFailures: 3 }));

    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile" })).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("list", { name: "Notifiche", exact: true }).getByRole("listitem")).toHaveCount(3);
  });
});

test.describe("notifiche su telefono", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("fits a 320px screen, with touch targets of at least 44px", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("list", { name: "Notifiche", exact: true }).getByRole("listitem")).toHaveCount(3);
    await settle(page);

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    const bar = page.getByRole("navigation", { name: "Navigazione principale" });
    const barLink = bar.getByRole("link", { name: "Notifiche 2 da leggere" });
    await expect(barLink).toBeVisible();
    const barBox = await barLink.boundingBox();
    expect(barBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(barBox?.width ?? 0).toBeGreaterThanOrEqual(44);

    const markRead = await page.getByRole("button", { name: "Segna come letta: Convocazione" }).boundingBox();
    expect(markRead?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(markRead?.width ?? 0).toBeGreaterThanOrEqual(44);

    await page.getByRole("tab", { name: "Preferenze" }).click();
    await expect(page.getByRole("switch")).toHaveCount(14);
    await settle(page);
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
