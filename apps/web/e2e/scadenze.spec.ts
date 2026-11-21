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

/** Twenty-six more athletes, so that the people of a document do not fit on one page. */
const MANY_MORE: TypePerson[] = Array.from({ length: 26 }, (_, index) =>
  holder(`m-extra-${index + 1}`, `Zeta ${String(index + 1).padStart(2, "0")}`, ["team-2", "U16"], "OK", "2027-06-30", 250),
);

function peopleFor(query: URLSearchParams, holders: TypePerson[]): TypePeople {
  const search = query.get("q")?.toLowerCase();
  const team = query.get("teamId");
  const status = query.get("status");
  const pageNumber = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 20);
  const matching = holders.filter(
    (person) =>
      (!search || person.memberName.toLowerCase().includes(search)) &&
      (!team || person.teams.some((entry) => entry.id === team)) &&
      (!status || person.status === status),
  );
  const start = (pageNumber - 1) * pageSize;
  return {
    stats: CERTIFICATE_STATS,
    people: matching.slice(start, start + pageSize),
    pagination: { page: pageNumber, pageSize, total: matching.length, totalPages: Math.ceil(matching.length / pageSize) },
  };
}

/** `failing` makes the document types endpoint answer 500 until `recover()` is called; `many` adds enough people for a second page. */
async function expirationsBackend(page: Page, failing = false, many = false) {
  const holders = many ? [...CERTIFICATE_HOLDERS, ...MANY_MORE] : CERTIFICATE_HOLDERS;
  let broken = failing;
  const recorded = await mockBackend(page, "admin", ({ method, path, query }) => {
    if (method !== "GET") return undefined;
    if (path === "/teams") return { body: pageOf(TEAMS) };
    if (path === "/document-types") {
      if (broken) return { status: 500, body: problem(500, "internal_error") };
      return { body: pageOf([CERTIFICATE_TYPE]) };
    }
    if (path === "/document-types/report") return { body: { data: [{ documentTypeId: CERTIFICATE_TYPE.id, ...CERTIFICATE_STATS }] } };
    if (path === `/document-types/${CERTIFICATE_TYPE.id}/people`) return { body: peopleFor(query, holders) };
    if (path === "/documents/expirations") {
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
  test("shows the totals as coloured numbers with their unit and the document cards, without a chart of expiries", async ({ page }) => {
    await expirationsBackend(page);
    await page.goto("/scadenze");

    await expect(
      page.getByRole("heading", { level: 1, name: "Scadenze sotto controllo. In automatico." }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prossime scadenze" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" })).toHaveCount(0);
    await expect(page.getByText("Certificato scaduto, atleta non convocabile")).toBeVisible();

    const report = page.getByRole("region", { name: "Rendiconto dei documenti" });
    const missing = report.getByText("Mancanti", { exact: true }).locator("../..");
    await expect(missing).toContainText("1 documento");
    // the unit sits beside the number, small, in the same colour: no line underneath
    const figure = missing.locator("p").last();
    const unit = figure.locator("span");
    await expect(unit).toHaveText("documento");
    await expect(unit).toHaveCSS("font-size", "14px");
    expect(await unit.evaluate((element) => getComputedStyle(element).color)).toBe(await figure.evaluate((element) => getComputedStyle(element).color));
    await expect(missing.locator("> *")).toHaveCount(2);

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

  test("names the icons of a card on hover, even though the whole card is a link", async ({ page }) => {
    await expirationsBackend(page);
    await page.goto("/scadenze");
    await page.getByRole("list", { name: "Documenti", exact: true }).getByText("persone in regola").locator("..").hover();
    await expect(page.getByRole("tooltip")).toHaveText("persone in regola");
  });

  test("opens a document: report, people with the state of their document, search and filters inside", async ({ page }) => {
    await expirationsBackend(page);
    await page.goto("/scadenze");
    await page.getByRole("link", { name: "Certificato medico" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Certificato medico" })).toBeVisible();
    const report = page.getByRole("region", { name: "Rendiconto del documento" });
    await expect(report.getByText("In scadenza", { exact: true }).locator("../..")).toContainText("1 persona");
    await expect(page.getByRole("navigation", { name: "Pagine delle persone" })).toHaveCount(0);
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

  test("gives twenty people per page and walks through the pages", async ({ page }) => {
    await expirationsBackend(page, false, true);
    await page.goto(`/scadenze/${CERTIFICATE_TYPE.id}`);

    const people = page.getByRole("list", { name: "Persone del documento" }).getByRole("listitem");
    const pages = page.getByRole("navigation", { name: "Pagine delle persone" });
    await expect(people).toHaveCount(20);
    await expect(pages).toContainText("1-20 di 30");
    await expect(pages).toContainText("Pagina 1 di 2");
    await expect(pages.getByRole("button", { name: "Precedente" })).toBeDisabled();

    await pages.getByRole("button", { name: "Successiva" }).click();
    await expect(people).toHaveCount(10);
    await expect(pages).toContainText("21-30 di 30");
    await expect(pages.getByRole("button", { name: "Successiva" })).toBeDisabled();
    await expect(people.last()).toContainText("Zeta 26");

    // a search starts again from the first page
    await page.getByLabel("Cerca un tesserato").fill("zeta");
    await expect(pages).toContainText("1-20 di 26");
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("shows an error with retry", async ({ page }) => {
    const backend = await expirationsBackend(page, true);
    await page.goto("/scadenze");
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    backend.recover();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("link", { name: "Certificato medico" })).toBeVisible();
  });

  test("fits a 320px screen, on the overview and on a page of people", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await expirationsBackend(page, false, true);
    await page.goto("/scadenze");
    await expect(page.getByRole("link", { name: "Certificato medico" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.goto(`/scadenze/${CERTIFICATE_TYPE.id}`);
    await expect(page.getByRole("navigation", { name: "Pagine delle persone" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
