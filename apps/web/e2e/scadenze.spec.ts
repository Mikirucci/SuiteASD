import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { CERTIFICATE_TYPE, TEAMS, mockBackend, pageOf, problem } from "./support/tesserati-fixtures";
import type { Expirations, ExpirationItem, TypePeople, TypePerson } from "../src/features/scadenze/types";

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

function holder(memberId: string, memberName: string, team: [string, string], status: TypePerson["status"], expiresAt: string | null, daysRemaining: number | null): TypePerson {
  return {
    memberId,
    memberName,
    teams: [{ id: team[0], name: team[1] }],
    status,
    documentId: status === "MISSING" ? null : `d-${memberId}`,
    expiresAt,
    daysRemaining,
    hasFile: status !== "MISSING",
  };
}

/** Ordered by name, as the API returns them. */
const CERTIFICATE_HOLDERS: TypePerson[] = [
  holder("m-anna", "Anna Ferri", ["team-3", "U18"], "EXPIRED", "2026-09-20", -22),
  holder("m-bea", "Bea Neri", ["team-2", "U16"], "MISSING", null, null),
  holder("m-giulia", "Giulia Rossi", ["team-4", "Serie D"], "EXPIRING", "2026-10-28", 5),
  holder("m-sara", "Sara Conti", ["team-2", "U16"], "OK", "2027-06-30", 250),
];

const CERTIFICATE_STATS = { validPeople: 1, expiringPeople: 1, expiredPeople: 1, missingPeople: 1 };

function peopleFor(query: URLSearchParams): TypePeople {
  const search = query.get("q")?.toLowerCase();
  const team = query.get("teamId");
  const status = query.get("status");
  const people = CERTIFICATE_HOLDERS.filter(
    (person) =>
      (!search || person.memberName.toLowerCase().includes(search)) &&
      (!team || person.teams.some((entry) => entry.id === team)) &&
      (!status || person.status === status),
  );
  return { stats: CERTIFICATE_STATS, people };
}

/** `failing` makes the timeline endpoint answer 500 until `recover()` is called. */
async function expirationsBackend(page: Page, failing = false) {
  let broken = failing;
  const recorded = await mockBackend(page, "admin", ({ method, path, query }) => {
    if (method !== "GET") return undefined;
    if (path === "/teams") return { body: pageOf(TEAMS) };
    if (path === "/document-types") return { body: pageOf([CERTIFICATE_TYPE]) };
    if (path === "/document-types/report") return { body: { data: [{ documentTypeId: CERTIFICATE_TYPE.id, ...CERTIFICATE_STATS }] } };
    if (path === `/document-types/${CERTIFICATE_TYPE.id}/people`) return { body: peopleFor(query) };
    if (path === "/documents/expirations") {
      if (broken) return { status: 500, body: problem(500, "internal_error") };
      const serieD = query.get("teamId") === "team-4";
      return { body: serieD ? windowOf([GIULIA, ELENA], []) : windowOf([GIULIA, SARA, SARA_COLLEAGUE, ELENA], [ANNA]) };
    }
    return undefined;
  });
  return {
    ...recorded,
    recover: () => {
      broken = false;
    },
  };
}

test.describe("Certificati e scadenze (02)", () => {
  test("shows the totals, the document cards and the timeline with its detail card", async ({ page }) => {
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

    await expect(page.getByText("Certificato scaduto, atleta non convocabile")).toBeVisible();

    const report = page.getByRole("region", { name: "Rendiconto dei documenti" });
    await expect(report.getByText("Mancanti", { exact: true }).locator("../..")).toContainText("1 documento");
    const card = page.getByRole("list", { name: "Documenti", exact: true }).getByRole("listitem");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("link", { name: "Certificato medico" })).toHaveAttribute("href", `/scadenze/${CERTIFICATE_TYPE.id}`);
    await expect(card.getByText("persone in regola").locator("xpath=preceding-sibling::span[1]")).toHaveText("1");
    await expect(card.getByText("persone con il documento in scadenza").locator("xpath=preceding-sibling::span[1]")).toHaveText("1");
    await expect(card.getByText("persone con il documento scaduto o mancante").locator("xpath=preceding-sibling::span[1]")).toHaveText("2");

    // no long lists on the main page: the people live inside each document
    await expect(page.getByRole("list", { name: "Documenti già scaduti" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Scadenze di novembre 2026" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Filtra per squadra" })).toHaveCount(0);

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

  test("opens a document: report, people with the state of their document, search and filters inside", async ({ page }) => {
    await expirationsBackend(page);
    await page.goto("/scadenze");
    await page.getByRole("link", { name: "Certificato medico" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Certificato medico" })).toBeVisible();
    const report = page.getByRole("region", { name: "Rendiconto del documento" });
    await expect(report.getByText("In scadenza", { exact: true }).locator("../..")).toContainText("1 persona");
    const people = page.getByRole("list", { name: "Persone del documento" }).getByRole("listitem");
    await expect(people).toHaveCount(4);
    await expect(people.nth(0)).toContainText("Anna Ferri");
    await expect(people.nth(0)).toContainText("Scaduto");
    await expect(people.filter({ hasText: "Bea Neri" })).toContainText("Non ancora consegnato");
    await expect(people.filter({ hasText: "Giulia Rossi" })).toContainText("Scade il 28 ottobre 2026");
    await expect(people.filter({ hasText: "Sara Conti" })).toContainText("In regola");
    await expect(people.nth(0).getByRole("link")).toHaveAttribute("href", "/tesserati/m-anna");

    await page.getByRole("button", { name: "In scadenza", exact: true }).click();
    await expect(people).toHaveCount(1);
    await expect(people).toContainText("Giulia Rossi");
    await expect(report.getByText("Mancanti", { exact: true }).locator("../..")).toContainText("1 persona");

    await page.getByRole("button", { name: "Tutti", exact: true }).click();
    await page.getByLabel("Squadra").selectOption({ label: "U16" });
    await expect(people).toHaveCount(2);
    await page.getByLabel("Cerca un tesserato").fill("sara");
    await expect(people).toHaveCount(1);
    await expect(people).toContainText("Sara Conti");

    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("shows an error with retry", async ({ page }) => {
    const backend = await expirationsBackend(page, true);
    await page.goto("/scadenze");
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    // the document cards do not depend on the timeline: they stay
    await expect(page.getByRole("link", { name: "Certificato medico" })).toBeVisible();
    backend.recover();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" })).toBeVisible();
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
