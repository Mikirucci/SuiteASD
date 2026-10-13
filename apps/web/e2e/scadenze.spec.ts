import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { CERTIFICATE_TYPE, TEAMS, mockBackend, pageOf, problem, type Role } from "./support/tesserati-fixtures";
import type { Expirations, ExpirationItem } from "../src/features/scadenze/types";

function expiration(
  documentId: string,
  memberId: string,
  firstName: string,
  lastName: string,
  team: string,
  expiresAt: string,
  daysRemaining: number,
): ExpirationItem {
  return {
    documentId,
    memberId,
    firstName,
    lastName,
    teams: [team],
    documentType: { id: CERTIFICATE_TYPE.id, key: CERTIFICATE_TYPE.key, name: CERTIFICATE_TYPE.name },
    expiresAt,
    daysRemaining,
    status: daysRemaining < 0 ? "EXPIRED" : daysRemaining <= 30 ? "EXPIRING" : "OK",
  };
}

const GIULIA = expiration("d-giulia", "m-giulia", "Giulia", "Rossi", "Serie D", "2026-10-28", 5);
const SARA = expiration("d-sara", "m-sara", "Sara", "Conti", "U16", "2026-11-27", 15);
const SARA_COLLEAGUE = expiration("d-francesca", "m-francesca", "Francesca", "Monti", "U16", "2026-11-27", 15);
const ELENA = expiration("d-elena", "m-elena", "Elena", "Russo", "Serie D", "2026-12-18", 36);
const ANNA = expiration("d-anna", "m-anna", "Anna", "Ferri", "U18", "2026-09-20", -22);

function windowOf(items: ExpirationItem[], overdue: ExpirationItem[]): Expirations {
  const months = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"].map((month) => ({
    month,
    items: items.filter((item) => item.expiresAt.startsWith(month)),
  }));
  return { from: "2026-10-01", to: "2027-03-31", months, overdue };
}

async function expirationsBackend(page: Page, role: Role = "admin", failures = 0) {
  let remainingFailures = failures;
  const recorded = await mockBackend(page, role, ({ method, path, query }) => {
    if (method !== "GET") return undefined;
    if (path === "/teams") return { body: pageOf(TEAMS) };
    if (path === "/document-types") return { body: pageOf([CERTIFICATE_TYPE]) };
    if (path === "/documents/expirations") {
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        return { status: 500, body: problem(500, "internal_error") };
      }
      if (role === "athlete") return { body: windowOf([SARA], []) };
      const serieD = query.get("teamId") === "team-4";
      return { body: serieD ? windowOf([GIULIA, ELENA], []) : windowOf([GIULIA, SARA, SARA_COLLEAGUE, ELENA], [ANNA]) };
    }
    return undefined;
  });
  return recorded;
}

test.describe("Certificati e scadenze (02)", () => {
  test("shows the timeline, the detail card and the lists by month", async ({ page }) => {
    await expirationsBackend(page);
    await page.goto("/scadenze");

    await expect(
      page.getByRole("heading", { level: 1, name: "Scadenze sotto controllo. In automatico." }),
    ).toBeVisible();
    const timeline = page.getByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" });
    await expect(timeline.getByRole("listitem")).toHaveCount(4);
    for (const month of ["ott", "nov", "dic", "gen", "feb", "mar"]) {
      await expect(page.getByText(month, { exact: true })).toBeVisible();
    }

    // The nearest expiry is selected by default
    await expect(page.getByText("Giulia Rossi · Certificato medico")).toBeVisible();
    await expect(page.getByText("— Scade tra 5 giorni")).toBeVisible();

    await timeline.getByRole("button", { name: /Sara Conti, scade il 27 novembre 2026/ }).click();
    await expect(page.getByText("Sara Conti · Certificato medico")).toBeVisible();
    await expect(page.getByText("— Scade tra 15 giorni")).toBeVisible();
    await expect(page.getByText("Automatico", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Apri la scheda" })).toHaveAttribute("href", "/tesserati/m-sara");

    await expect(page.getByRole("list", { name: "Scadenze di novembre 2026" }).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("list", { name: "Scadenze di ottobre 2026" })).toContainText("Giulia Rossi");
    await expect(page.getByRole("list", { name: "Documenti già scaduti" })).toContainText("Scaduto da 22 giorni");
    await expect(page.getByText("Certificato scaduto, atleta non convocabile")).toBeVisible();

    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("keeps overlapping avatars reachable: the two expiries of the same day are both clickable", async ({ page }) => {
    await expirationsBackend(page);
    await page.goto("/scadenze");
    const timeline = page.getByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" });
    const sara = timeline.getByRole("button", { name: /Sara Conti/ });
    const francesca = timeline.getByRole("button", { name: /Francesca Monti/ });
    const [first, second] = [await sara.boundingBox(), await francesca.boundingBox()];
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Same day, so they must not sit on top of each other
    const overlap =
      Math.abs((first?.x ?? 0) - (second?.x ?? 0)) < 40 && Math.abs((first?.y ?? 0) - (second?.y ?? 0)) < 40;
    expect(overlap).toBe(false);
    await francesca.click();
    await expect(page.getByText("Francesca Monti · Certificato medico")).toBeVisible();
  });

  test("filters by team using the team pills", async ({ page }) => {
    const recorded = await expirationsBackend(page);
    await page.goto("/scadenze");
    await page.getByRole("group", { name: "Filtra per squadra" }).getByRole("button", { name: "Serie D" }).click();
    const timeline = page.getByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" });
    await expect(timeline.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("list", { name: "Documenti già scaduti" })).toHaveCount(0);
    expect(recorded.calls.filter((call) => call === "GET /documents/expirations").length).toBeGreaterThanOrEqual(2);
  });

  test("shows an error with retry", async ({ page }) => {
    await expirationsBackend(page, "admin", 3); // first attempt plus the two automatic retries
    await page.goto("/scadenze");
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" })).toBeVisible();
  });

  test("tells an athlete only about their own expiries", async ({ page }) => {
    await expirationsBackend(page, "athlete");
    await page.goto("/scadenze");
    const timeline = page.getByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" });
    await expect(timeline.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Filtra per squadra" })).toHaveCount(0);
    await expect(page.getByText("Sara Conti · Certificato medico")).toBeVisible();
  });

  test("fits a 320px screen: the timeline scrolls instead of squeezing", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await expirationsBackend(page);
    await page.goto("/scadenze");
    await expect(page.getByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
