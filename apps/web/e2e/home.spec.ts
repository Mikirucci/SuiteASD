import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiAnswer, type ApiHandler, type MeOptions } from "./support/route-api";

const ADMIN: MeOptions = {
  roles: ["ADMIN"],
  permissions: [
    "members:read",
    "teams:read",
    "teams:write",
    "documents:read",
    "payments:read",
    "events:read",
    "convocations:read",
    "competitions:read",
    "notifications:readOwn",
    "automations:read",
    "joinLinks:read",
    "joinLinks:write",
    "ledger:read",
    "invitations:write",
    "attendance:read",
    "staff:read",
    "venues:read",
  ],
};
const COACH: MeOptions = {
  roles: ["ALLENATORE"],
  permissions: ["members:read", "documents:read", "events:read", "convocations:read", "competitions:read", "notifications:readOwn", "teams:read", "attendance:read"],
};

const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

const MATCH = {
  id: "ev-1",
  type: "MATCH",
  title: "Aquile Volley vs Delfini Volley",
  startsAt: inDays(3),
  endsAt: null,
  status: "SCHEDULED",
  notes: null,
  team: { id: "t-sd", name: "Serie D" },
  venue: { id: "v1", name: "Palazzetto", address: null },
  recurrenceRule: null,
  recurrenceParentId: null,
  convocations: { confirmed: 5, declined: 1, pending: 6, total: 12, capacity: 12 },
  convocationsSentAt: null,
  createdAt: inDays(-10),
  updatedAt: inDays(-10),
};

const NOTIFICATION = { id: "n1", type: "ADMIN_NEW_ENROLMENT", title: "Nuova iscrizione", body: "Giulia Rossi · U16", readAt: null, createdAt: inDays(-1) };

interface BackendOptions {
  /** A society with no teams and no members. */
  fresh?: boolean;
  /** The society already has a fee plan: with it, every step of the path "Per iniziare" is done. */
  withFeePlan?: boolean;
}

/** Network-level backend of the pages the home reads: counts, expirations, fees, events, notifications. */
function homeBackend({ fresh = false, withFeePlan = false }: BackendOptions = {}): ApiHandler {
  return ({ method, path }): ApiAnswer | undefined => {
    if (method !== "GET") return undefined;
    switch (path) {
      case "/members/summary":
        return { body: fresh ? { tesserati: 0, squadre: 0, documentiMancanti: 0 } : { tesserati: 118, squadre: 6, documentiMancanti: 2 } };
      case "/documents/expirations":
        return { body: { from: "2026-10-01", to: "2027-04-01", overdue: [], months: [] } };
      case "/fees/summary":
        return { body: { incassatoCents: 24000, daIncassareCents: 18000, scadutoCents: 6000, promemoriaInviati: 4, paidCount: 4, pendingCount: 2, overdueCount: 1 } };
      case "/fee-plans":
        return pageOf(withFeePlan ? [{ id: "plan-1" }] : []);
      case "/events":
        return pageOf(fresh ? [] : [MATCH]);
      case "/notifications":
        return pageOf([NOTIFICATION]);
      case "/notifications/unread-count":
        return { body: { count: 1 } };
      case "/automations":
        return { body: { data: [], summary: { active: 7, total: 10, percentage: 70 } } };
      case "/teams":
      case "/seasons":
      case "/join-links":
        return pageOf([]);
      default:
        return undefined;
    }
  };
}

async function openHome(page: Page, me: MeOptions, options: BackendOptions = {}) {
  await mockApi(page);
  const api = await routeApi(page, me, homeBackend(options));
  await seedStoredSession(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();
  return api;
}

test.describe("home dell'amministrazione", () => {
  test("orders the page in three levels and leads to the right pages", async ({ page }) => {
    await openHome(page, ADMIN, { withFeePlan: true });
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Da fare adesso", "I tuoi servizi", "Il resto"]);

    const todo = page.getByRole("region", { name: "Da fare adesso" });
    await expect(todo.getByRole("link", { name: /Quota scaduta/ })).toHaveAttribute("href", "/quote");
    await expect(todo.getByRole("link", { name: /Convocati senza risposta/ })).toHaveAttribute("href", "/calendario");

    const services = page.getByRole("region", { name: "I tuoi servizi" });
    await expect(services.getByRole("heading", { level: 3 })).toHaveText(["Persone", "Calendario e partite", "Pagamenti", "Documenti e scadenze"]);
    await expect(services.getByText("118")).toBeVisible();
    await expect(services.getByRole("link", { name: "Accessi e inviti" })).toHaveAttribute("href", "/inviti");
    await expect(services.getByRole("link", { name: "Bilancio" })).toHaveAttribute("href", "/altro/bilancio");

    await page.waitForTimeout(800);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("shows a coach only the services the coach may open", async ({ page }) => {
    await openHome(page, COACH);
    const services = page.getByRole("region", { name: "I tuoi servizi" });
    await expect(services.getByRole("heading", { level: 3 })).toHaveText(["Persone", "Calendario e partite", "Documenti e scadenze"]);
    await expect(page.getByRole("heading", { name: "Pagamenti" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Quota scaduta/ })).toHaveCount(0);
  });

  test("fits a 320px phone without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openHome(page, ADMIN);
    await expect(page.getByRole("region", { name: "I tuoi servizi" }).getByText("118")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("a running society sees a compact path and \"Da fare adesso\" on the first screen of a laptop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openHome(page, ADMIN);
    const start = page.getByRole("region", { name: "Per iniziare" });
    await expect(start.getByText("3 su 4 fatti")).toBeVisible();
    await expect(start.getByText("Già fatti: squadre, tesserati e calendario")).toBeVisible();
    await expect(start.getByRole("heading", { level: 3 })).toHaveText(["Passo 3: Imposta le quote"]);
    await expect(start.getByRole("link", { name: "Imposta le quote" })).toHaveAttribute("href", "/quote");

    const todo = page.getByRole("heading", { level: 2, name: "Da fare adesso" });
    await expect(todo).toBeVisible();
    const box = await todo.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(720);
  });

  test("a new society starts from the path, not from an empty dashboard", async ({ page }) => {
    await openHome(page, ADMIN, { fresh: true });
    await expect(page.getByRole("heading", { level: 2, name: "Per iniziare" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Da fare adesso" })).toHaveCount(0);
    await expect(page.getByText("0 su 4 fatti")).toBeVisible();
    await expect(page.getByRole("link", { name: "Crea una squadra" })).toHaveAttribute("href", "/squadre");

    await page.getByRole("button", { name: "Crea il link di iscrizione" }).click();
    await expect(page.getByRole("dialog", { name: "Link di iscrizione" })).toBeVisible();
  });
});
