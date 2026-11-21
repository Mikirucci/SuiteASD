import { expect, test, type Page } from "@playwright/test";
import { CATEGORIES, ENTRATE, INCOME_CATEGORIES, PALLONI, COMUNE, SPESE, summaryOf, trendOf } from "../src/features/altro/ledger-data";
import { ALLENATORE, MAGLIA, PALAZZETTO, PANIFICIO, REPORT_SUMMARY, SCUOLA, TRASFERTA, TUTA } from "../src/features/altro/test-fixtures";
import type { LedgerEntry } from "../src/features/altro/types";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiAnswer, type ApiHandler, type ApiRequest } from "./support/route-api";

const READ_PERMISSIONS = [
  "attendance:read",
  "documents:read",
  "venues:read",
  "trips:read",
  "kits:read",
  "sponsors:read",
  "ledger:read",
  "statistics:read",
  "announcements:read",
  "staff:read",
  "competitions:read",
  "referees:read",
];
const ADMIN = { roles: ["ADMIN"], permissions: [...READ_PERMISSIONS, "venues:write", "trips:write", "kits:write", "sponsors:write", "ledger:write", "staff:write", "members:read"] };
const READER = { roles: ["ALLENATORE"], permissions: ["venues:read", "trips:read", "kits:read", "staff:read"] };

/** Lets enter animations (dialogs, list reveal) finish so the colour contrast check reads the final colours. */
/** Opens the "⋯" menu of a record and chooses one of its items. */
async function pickFromMenu(page: Page, trigger: string | RegExp, item: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: trigger }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

/** In-memory REST resource: list, create, patch and delete behave like the real API for the UI under test. */
function resource<T extends { id: string }>(
  path: string,
  initial: T[],
  options: { failures?: { remaining: number }; defaults?: Partial<T> } = {},
): { handler: ApiHandler; items: () => T[] } {
  const failures = options.failures ?? { remaining: 0 };
  let items = initial;
  let counter = 0;
  const handler: ApiHandler = ({ method, path: requested, body }: ApiRequest): ApiAnswer | undefined => {
    if (requested === path) {
      if (method === "GET") {
        if (failures.remaining > 0) {
          failures.remaining -= 1;
          return { status: 500, body: { type: "about:blank", title: "Internal Server Error", status: 500, code: "internal" } };
        }
        return pageOf(items);
      }
      if (method === "POST") {
        counter += 1;
        const created = { id: `new-${counter}`, ...options.defaults, ...(body as object) } as unknown as T;
        items = [...items, created];
        return { status: 201, body: created };
      }
    }
    if (requested.startsWith(`${path}/`)) {
      const id = requested.slice(path.length + 1);
      if (method === "PATCH") {
        items = items.map((item) => (item.id === id ? { ...item, ...(body as object) } : item));
        return { body: items.find((item) => item.id === id) };
      }
      if (method === "DELETE") {
        items = items.filter((item) => item.id !== id);
        return { status: 204 };
      }
    }
    return undefined;
  };
  return { handler, items: () => items };
}

function combine(...handlers: ApiHandler[]): ApiHandler {
  return (request) => {
    for (const handler of handlers) {
      const answer = handler(request);
      if (answer) return answer;
    }
    return undefined;
  };
}

const NO_VENUE_DETAILS = { address: null, city: null, capacity: null, availability: null, notes: null };
const NO_ENTRY_DETAILS = { description: null, supplier: null, notes: null, paymentId: null, source: null, sourceId: null };
const venues = () => resource("/venues", [PALAZZETTO, SCUOLA], { defaults: NO_VENUE_DETAILS });
/** What GET /venues/summary answers for the two venues above: the totals on top of the page. */
const venueSummary: ApiHandler = ({ method, path }) =>
  method === "GET" && path === "/venues/summary"
    ? { body: { count: 2, capacityTotal: 400, costTotalCents: 45000, costThisMonthCents: 0, costedCount: 1, priciest: { name: "Palazzetto dello Sport", costCents: 45000 }, weeklyMinutes: 360, slotsCount: 2 } }
    : undefined;
/** The attachments of a record that has none: the detail of a card asks for them. */
const noAttachments: ApiHandler = ({ method, path }) => (method === "GET" && path === "/attachments" ? { body: { data: [] } } : undefined);

async function openAs(page: Page, url: string, me: Parameters<typeof routeApi>[1], handler: ApiHandler) {
  await mockApi(page);
  const api = await routeApi(page, me, handler);
  await seedStoredSession(page);
  await page.goto(url);
  return api;
}

test.describe("altro, navigazione per argomento", () => {
  test("the old hub sends back to the home and each topic of the menu leads to its page, without accessibility violations", async ({ page }) => {
    await openAs(page, "/altro", ADMIN, () => undefined);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();

    const sidebar = page.getByRole("navigation", { name: "Sezioni", exact: true });
    await expect(sidebar.getByRole("link", { name: "Altro" })).toHaveCount(0);
    const amministrazione = sidebar.getByRole("button", { name: "Amministrazione" });
    await expect(amministrazione).toHaveAttribute("aria-expanded", "false");
    await amministrazione.click();
    await expect(amministrazione).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar.getByRole("link", { name: "Scadenze e documenti" })).toHaveAttribute("href", "/scadenze");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    // the movements are a topic of their own, with the incomes and the expenses; the balance sits next to it, not inside
    const movimenti = sidebar.getByRole("button", { name: "Movimenti" });
    await expect(movimenti).toHaveAttribute("aria-expanded", "false");
    await movimenti.click();
    await expect(sidebar.getByRole("link", { name: "Entrate" })).toHaveAttribute("href", "/altro/entrate");
    await sidebar.getByRole("link", { name: "Uscite" }).click();
    await expect(page).toHaveURL(/\/altro\/uscite$/);
    await expect(sidebar.getByRole("link", { name: "Uscite" })).toHaveAttribute("aria-current", "page");
    await sidebar.getByRole("link", { name: "Bilancio" }).click();
    await expect(page).toHaveURL(/\/altro\/bilancio$/);
    await expect(sidebar.getByRole("link", { name: "Bilancio" })).toHaveAttribute("aria-current", "page");
  });

  test("shows only the sections the role can read", async ({ page }) => {
    await openAs(page, "/", READER, () => undefined);
    const sidebar = page.getByRole("navigation", { name: "Sezioni", exact: true });
    // Staff is the only item of its topic and Logistica holds the three readable ones
    await expect(sidebar.getByRole("button")).toHaveText(["Logistica"]);
    await expect(sidebar.getByRole("link", { name: "Staff" })).toHaveAttribute("href", "/altro/staff");
    await sidebar.getByRole("button", { name: "Logistica" }).click();
    await expect(sidebar.getByRole("link")).toHaveText(["Home", "Staff", "Palestre", "Trasferte", "Divise"]);
    await expect(sidebar.getByRole("link", { name: "Sponsor" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Bilancio" })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "Movimenti" })).toHaveCount(0);
  });
});

test.describe("altro, palestre", () => {
  test("lists, creates, edits and deletes a venue", async ({ page }) => {
    const store = venues();
    const api = await openAs(page, "/altro/palestre", ADMIN, combine(venueSummary, store.handler, noAttachments));

    await expect(page.getByRole("heading", { level: 1, name: /Dove ci alleniamo e giochiamo/ })).toBeVisible();
    // the totals at a glance: how many, what is spent and on which one, how many hours a week; no way out to the costs
    const tiles = page.getByRole("region", { name: "Riepilogo delle palestre" });
    await expect(tiles).toContainText("Capienza totale 400 persone");
    await expect(tiles.getByText("Più costosa").locator("../..")).toContainText("Palazzetto dello Sport");
    await expect(tiles.getByText("Ore a settimana").locator("../..")).toContainText("6 h");
    await expect(page.getByRole("link", { name: /costi delle palestre/ })).toHaveCount(0);
    const list = page.getByRole("list", { name: "Palestre", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    const card = list.getByRole("listitem").filter({ hasText: "Palazzetto dello Sport" });
    // only where it is, how big and what it costs: hours and notes are in the detail
    await expect(card).toContainText("Via dello Sport 12 · Bergamo");
    await expect(card).toContainText("Capienza 400 persone");
    await expect(card).not.toContainText("18:00");
    await expect(card.getByRole("button")).toHaveCount(1);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    // the card opens the detail on the same page: fields, attachments, delete
    await card.getByRole("button", { name: "Palazzetto dello Sport" }).click();
    const detail = page.getByRole("dialog", { name: "Palazzetto dello Sport" });
    // the hours are rows (day, from, to), and what they cannot say is written under "Altro"
    await expect(detail.getByLabel("Giorno dell'orario 1")).toHaveValue("2");
    await expect(detail.getByLabel("Dalle, orario 2", { exact: true })).toHaveValue("18:00");
    await expect(detail.getByLabel("Altro")).toHaveValue("Anche il sabato per le gare");
    await expect(detail.getByRole("heading", { name: "Allegati" })).toBeVisible();
    await expect(detail.getByText("Nessun allegato")).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await detail.getByRole("button", { name: "Chiudi", exact: true }).first().click();
    await expect(detail).toBeHidden();

    await page.getByRole("button", { name: "Nuova palestra" }).click();
    const form = page.getByRole("dialog", { name: "Nuova palestra" });
    await form.getByRole("button", { name: "Crea la palestra" }).click();
    await expect(form.getByText("Inserisci il nome della palestra")).toBeVisible();
    await form.getByLabel(/Nome della palestra/).fill("Palestra Comunale");
    await form.getByLabel("Città").fill("Seriate");
    await form.getByRole("button", { name: "Aggiungi un orario" }).click();
    await form.getByLabel("Giorno dell'orario 1").selectOption("3");
    await form.getByLabel("Alle, orario 1", { exact: true }).fill("20:00");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await form.getByRole("button", { name: "Crea la palestra" }).click();

    await expect(page.getByText("Palestra creata")).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    expect(api.bodies.get("POST /venues")).toEqual({ name: "Palestra Comunale", city: "Seriate", slots: [{ weekday: 3, from: "18:00", to: "20:00" }] });

    await list.getByRole("button", { name: "Palestra Comunale" }).click();
    const edit = page.getByRole("dialog", { name: "Palestra Comunale" });
    await edit.getByLabel("Indirizzo").fill("Via Roma 3");
    await edit.getByRole("button", { name: "Salva le modifiche" }).click();
    await expect(page.getByText("Palestra aggiornata")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: "Palestra Comunale" })).toContainText("Via Roma 3 · Seriate");

    await list.getByRole("button", { name: "Palestra Comunale" }).click();
    await page.getByRole("dialog", { name: "Palestra Comunale" }).getByRole("button", { name: "Elimina" }).click();
    const confirm = page.getByRole("dialog", { name: "Eliminare Palestra Comunale?" });
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await confirm.getByRole("button", { name: "Elimina" }).click();
    await expect(page.getByText("Palestra eliminata")).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    expect(store.items().map((venue) => venue.id)).toEqual(["v-palazzetto", "v-scuola"]);
  });

  test("explains an error and reloads with Riprova", async ({ page }) => {
    // React Query retries a failing GET twice: the third answer is the one the user sees.
    const store = resource("/venues", [PALAZZETTO], { failures: { remaining: 3 } });
    await openAs(page, "/altro/palestre", ADMIN, combine(venueSummary, store.handler));

    const alert = page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile" });
    await expect(alert).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await alert.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("list", { name: "Palestre", exact: true }).getByRole("listitem")).toHaveCount(1);
  });

  test("shows an empty state that explains what to add", async ({ page }) => {
    await openAs(page, "/altro/palestre", ADMIN, combine(venueSummary, resource("/venues", []).handler));
    await expect(page.getByRole("heading", { name: "Nessuna palestra" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuova palestra" })).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a role that can only read opens the card to read: hours and notes, but nothing to change", async ({ page }) => {
    await openAs(page, "/altro/palestre", READER, combine(venueSummary, venues().handler));
    const list = page.getByRole("list", { name: "Palestre", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Nuova palestra" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Altre azioni di / })).toHaveCount(0);
    await list.getByRole("button", { name: "Palazzetto dello Sport" }).click();
    const detail = page.getByRole("dialog", { name: "Palazzetto dello Sport" });
    await expect(detail.getByLabel("Dalle, orario 1", { exact: true })).toHaveValue("18:00");
    await expect(detail.getByLabel("Dalle, orario 1", { exact: true })).toBeDisabled();
    await expect(detail.getByLabel("Altro")).toBeDisabled();
    for (const name of ["Salva le modifiche", "Elimina"]) await expect(detail.getByRole("button", { name })).toHaveCount(0);
    await expect(detail.getByRole("heading", { name: "Allegati" })).toHaveCount(0);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});

/** Groups of the wardrobe, as GET /kits/groups answers them for the pieces of the fixtures. */
const kitGroups = (): ApiHandler => ({ method, path }) =>
  method === "GET" && path === "/kits/groups"
    ? {
        body: {
          data: [
            { item: "Maglia gara", total: 1, assigned: 1, inStock: 0, totalCostCents: 2500 },
            { item: "Tuta", total: 1, assigned: 0, inStock: 1, totalCostCents: 0 },
          ],
        },
      }
    : undefined;

test.describe("altro, divise", () => {
  test("shows one card per item with the totals and the previews, without accessibility violations", async ({ page }) => {
    await openAs(page, "/altro/divise", ADMIN, combine(resource("/kits", [MAGLIA, TUTA]).handler, kitGroups()));
    await expect(page.getByRole("heading", { level: 1, name: /Ogni maglia al suo posto/ })).toBeVisible();

    const report = page.getByRole("region", { name: "Rendiconto delle divise" });
    await expect(report.getByText("Capi", { exact: true }).locator("../..")).toContainText("2");
    await expect(report.getByText("Costo", { exact: true }).locator("../..")).toContainText(/€\s25/);

    const cards = page.getByRole("list", { name: "Capi", exact: true }).getByRole("listitem");
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: "Maglia gara" }).getByRole("link")).toHaveAttribute("href", "/altro/divise/Maglia%20gara");
    await expect(cards.filter({ hasText: "Maglia gara" }).getByText("capi assegnati").locator("xpath=preceding-sibling::span[1]")).toHaveText("1");
    await expect(cards.filter({ hasText: "Tuta" }).getByText("capi in magazzino").locator("xpath=preceding-sibling::span[1]")).toHaveText("1");
    // the pieces are inside each card, not on the main page
    await expect(page.getByRole("list", { name: "Divise", exact: true })).toHaveCount(0);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("opens an item: its totals and its pieces as cards, with search and filter inside", async ({ page }) => {
    const api = await openAs(page, "/altro/divise", ADMIN, combine(resource("/kits", [MAGLIA]).handler, kitGroups()));
    await page.getByRole("link", { name: "Maglia gara" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Maglia gara" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tutte le divise" })).toHaveAttribute("href", "/altro/divise");
    const pieces = page.getByRole("list", { name: "Divise", exact: true }).getByRole("listitem");
    await expect(pieces).toHaveCount(1);
    await expect(pieces).toContainText("Maglia gara · S · n. 7");
    await expect(pieces).toContainText("Assegnato a Giulia Rossi");
    await expect(pieces).toContainText(/Costo: €\s25/);
    await page.getByLabel("Cerca per capo, taglia o assegnatario").fill("Rossi");
    await expect.poll(() => api.calls.length).toBeGreaterThan(0);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});

test.describe("altro, altre pagine", () => {
  const pages = [
    { url: "/altro/trasferte", heading: /Chi parte, con cosa e quanto costa/, handler: () => resource("/trips", [TRASFERTA]).handler, row: "Palasport Delfini, Verona", badge: "Confermata" },
    { url: "/altro/sponsor", heading: /Contratti e scadenze sotto controllo/, handler: () => sponsors(), row: "Panificio Rizzi", badge: "Attivo" },
    { url: "/altro/staff", heading: /Chi guida le squadre/, handler: () => resource("/staff", [ALLENATORE]).handler, row: "Marco Villa", badge: "Allenatore" },
  ];

  for (const entry of pages) {
    test(`${entry.url} shows its list and has no accessibility violations`, async ({ page }) => {
      await openAs(page, entry.url, ADMIN, entry.handler());
      await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
      const row = page.getByRole("listitem").filter({ hasText: entry.row });
      await expect(row).toContainText(entry.badge);
      await settle(page);
      expect(await auditAccessibility(page)).toEqual([]);
    });
  }

  test("assigns a kit to a member found by name", async ({ page }) => {
    const kits = resource("/kits", [TUTA]);
    const members: ApiHandler = ({ method, path, query }) =>
      method === "GET" && path === "/members"
        ? pageOf(query.get("q") === "rossi" ? [{ id: "m-rossi", firstName: "Giulia", lastName: "Rossi" }] : [{ id: "m-ferri", firstName: "Anna", lastName: "Ferri" }])
        : undefined;
    const api = await openAs(page, "/altro/divise/Tuta", ADMIN, combine(kits.handler, members, kitGroups()));

    await pickFromMenu(page, /^Altre azioni di Tuta/, /^Modifica Tuta/);
    const dialog = page.getByRole("dialog", { name: "Modifica il capo" });
    await dialog.getByLabel("Cerca un tesserato").fill("rossi");
    await expect(dialog.getByRole("option", { name: "Giulia Rossi" })).toBeAttached();
    await dialog.getByLabel("Assegnato a").selectOption({ label: "Giulia Rossi" });
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Salva le modifiche" }).click();

    await expect(page.getByText("Capo aggiornato")).toBeVisible();
    expect(api.bodies.get("PATCH /kits/k-tuta")).toMatchObject({ memberId: "m-rossi" });
  });
});

// The movements of the demo year: the same entries answer the lists, the totals and the chart, so the pages cannot disagree
const ALL_ENTRIES: readonly LedgerEntry[] = [...ENTRATE, ...SPESE];
const ledger = () =>
  combine(
    ({ method, path, query }) => {
      if (method !== "GET") return undefined;
      const ofKind = () => (query.get("kind") === "INCOME" ? ENTRATE : SPESE).filter((entry) => !query.get("category") || entry.category === query.get("category"));
      if (path === "/ledger/summary") return { body: summaryOf(ofKind()) };
      if (path === "/ledger/entries") return { body: { data: ofKind(), page: { nextCursor: null, hasMore: false } } };
      if (path === "/ledger/trend") return { body: trendOf(ALL_ENTRIES) };
      if (path === "/ledger/categories") return { body: { data: query.get("kind") === "INCOME" ? INCOME_CATEGORIES : CATEGORIES } };
      if (path === "/reports/accounting/summary") return { body: REPORT_SUMMARY };
      return undefined;
    },
    noAttachments,
    ({ method, path }) => (method === "POST" && path === "/attachments" ? { status: 201, body: { id: "att-1" } } : undefined),
    // writes: they answer as the real API does, the lists above stay as the demo year
    resource("/ledger/entries", [PALLONI, COMUNE], { defaults: NO_ENTRY_DETAILS }).handler,
  );

test.describe("altro, uscite", () => {
  test("shows the year by category with the sections that feed it, opens a category and an expense, registers a new one", async ({ page }) => {
    const api = await openAs(page, "/altro/uscite", ADMIN, ledger());

    await expect(page.getByRole("heading", { level: 1, name: /Dove vanno i soldi/ })).toBeVisible();
    const sidebar = page.getByRole("navigation", { name: "Sezioni", exact: true });
    await expect(sidebar.getByRole("link", { name: "Uscite" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("button", { name: "Movimenti" })).toHaveAttribute("aria-expanded", "true");
    const tiles = page.getByRole("region", { name: "Rendiconto delle uscite" });
    await expect(tiles).toContainText(/€\s805/);
    await expect(tiles).toContainText("Registrate qui");

    // the sections that write the costs by themselves are one click away
    const sources = page.getByRole("list", { name: "Sezioni collegate" });
    await expect(sources.getByRole("link")).toHaveText(["Palestre", "Divise", "Trasferte", "Arbitri"]);
    await expect(sources.getByRole("link", { name: "Palestre" })).toHaveAttribute("href", "/altro/palestre");

    // one card per category
    const cards = page.getByRole("list", { name: "Categorie", exact: true });
    await expect(cards.getByRole("listitem")).toHaveCount(2);
    await expect(cards.getByRole("listitem").filter({ hasText: "Attrezzatura sportiva" })).toContainText("Palloni da gara, Reti da gara");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    // the period: the panel with its four ways, then a month; "Azzera filtri" brings the year back
    const period = page.getByRole("group", { name: "Periodo", exact: true });
    await period.getByRole("button", { name: String(new Date().getFullYear()) }).click();
    const panel = page.getByRole("dialog", { name: "Scegli il periodo" });
    await expect(panel.getByRole("tab")).toHaveCount(4);
    expect(await auditAccessibility(page)).toEqual([]);
    await panel.getByRole("tab", { name: "Mese" }).click();
    await panel.getByRole("button", { name: `novembre ${new Date().getFullYear()}` }).click();
    await expect(panel).toBeHidden();
    await expect(period).toContainText(`Novembre ${new Date().getFullYear()}`);
    await expect(page).toHaveURL(/dal=\d{4}-11-01&al=\d{4}-11-30/);
    await expect.poll(() => api.calls.filter((call) => call === "GET /ledger/summary").length).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Azzera filtri" }).click();
    await expect(page.getByRole("button", { name: "Azzera filtri" })).toBeHidden();
    await expect(page).not.toHaveURL(/dal=/);

    // a card opens the page of the category, with the expenses that make it
    await cards.getByRole("link", { name: "Attrezzatura sportiva" }).click();
    await expect(page).toHaveURL(/\/altro\/uscite\/Attrezzatura%20sportiva/);
    await expect(page.getByRole("heading", { level: 1, name: "Attrezzatura sportiva" })).toBeVisible();
    const list = page.getByRole("list", { name: "Spese", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    const palloni = list.getByRole("listitem").filter({ hasText: "Palloni da gara" });
    await expect(palloni).toContainText("Attrezzatura sportiva · Volley Shop Emilia");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    // the expense opens on the same page: its fields, its attachments, no Modifica
    await palloni.getByRole("button", { name: "Palloni da gara" }).click();
    const detail = page.getByRole("dialog", { name: "Palloni da gara" });
    await expect(detail.getByLabel(/Fornitore/)).toHaveValue("Volley Shop Emilia");
    await expect(detail.getByRole("heading", { name: "Allegati" })).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await detail.getByRole("button", { name: "Chiudi", exact: true }).first().click();
    await expect(detail).toBeHidden();

    await page.getByRole("button", { name: "Nuova spesa" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuova spesa" });
    await expect(form.getByLabel(/Categoria/)).toHaveValue("Attrezzatura sportiva");
    await form.getByLabel(/Nome della spesa/).fill("Nastro e gessetti");
    await form.getByLabel(/Data/).fill("2026-11-10");
    await form.getByLabel(/Importo in euro/).fill("18,40");
    await form.getByLabel(/Fornitore/).fill("Sport Center");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await form.getByRole("button", { name: "Registra la spesa" }).click();

    await expect(page.getByText("Spesa registrata")).toBeVisible();
    expect(api.bodies.get("POST /ledger/entries")).toEqual({
      kind: "EXPENSE",
      description: "Nastro e gessetti",
      category: "Attrezzatura sportiva",
      amountCents: 1840,
      occurredOn: "2026-11-10",
      supplier: "Sport Center",
    });

    // the way back keeps the period; an expense that follows another section says where it is changed
    await page.getByRole("link", { name: "Tutte le uscite" }).click();
    await expect(page).toHaveURL(/\/altro\/uscite$/);
    await cards.getByRole("link", { name: "Arbitri" }).click();
    const note = page.getByRole("status").filter({ hasText: "Una parte nasce da Arbitri" });
    await expect(note.getByRole("link", { name: "Vai a Arbitri" })).toHaveAttribute("href", "/altro/arbitri");
    const referee = page.getByRole("list", { name: "Spese", exact: true }).getByRole("listitem").filter({ hasText: "Roberto Cattaneo" });
    await expect(referee.getByText("Arbitro", { exact: true })).toBeVisible();
    await referee.getByRole("button", { name: /Roberto Cattaneo/ }).click();
    const owned = page.getByRole("dialog", { name: /Roberto Cattaneo/ });
    await expect(owned.getByText("Registrata da Arbitri")).toBeVisible();
    await expect(owned.getByLabel(/Importo in euro/)).toBeDisabled();
    await expect(owned.getByRole("button", { name: "Salva le modifiche" })).toHaveCount(0);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});

test.describe("altro, entrate", () => {
  test("shows where the money comes from, opens the sponsors that produced an income and leads to them", async ({ page }) => {
    const api = await openAs(page, "/altro/entrate", ADMIN, ledger());

    await expect(page.getByRole("heading", { level: 1, name: /Da dove arrivano i soldi/ })).toBeVisible();
    const sidebar = page.getByRole("navigation", { name: "Sezioni", exact: true });
    await expect(sidebar.getByRole("link", { name: "Entrate" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "Rendiconto delle entrate" })).toContainText(/€\s2240/);
    const sources = page.getByRole("list", { name: "Sezioni collegate" });
    await expect(sources.getByRole("link")).toHaveText(["Pagamenti", "Sponsor"]);

    const cards = page.getByRole("list", { name: "Categorie", exact: true });
    await expect(cards.getByRole("listitem")).toHaveCount(3);
    await expect(cards.getByRole("listitem").filter({ hasText: "Sponsor" })).toContainText(/\+\s€\s1500/);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    // the topic reloads with the sponsors that produced it, and says where they come from
    await cards.getByRole("link", { name: "Sponsor" }).click();
    await expect(page).toHaveURL(/\/altro\/entrate\/Sponsor/);
    await expect(page.getByRole("heading", { level: 1, name: "Sponsor" })).toBeVisible();
    const note = page.getByRole("status").filter({ hasText: "Una parte nasce da Sponsor" });
    await expect(note.getByRole("link", { name: "Vai a Sponsor" })).toHaveAttribute("href", "/altro/sponsor");
    const list = page.getByRole("list", { name: "Entrate", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    const ottica = list.getByRole("listitem").filter({ hasText: "Ottica Rossi" });
    await expect(ottica).toContainText(/\+\s€\s1500/);
    await ottica.getByRole("button", { name: "Ottica Rossi" }).click();
    const detail = page.getByRole("dialog", { name: "Ottica Rossi" });
    await expect(detail.getByText("Registrata da Sponsor")).toBeVisible();
    await expect(detail.getByRole("link", { name: "Vai a Sponsor" })).toHaveAttribute("href", "/altro/sponsor");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await detail.getByRole("button", { name: "Chiudi", exact: true }).first().click();

    // an income that no section feeds is written here
    await page.getByRole("link", { name: "Tutte le entrate" }).click();
    await cards.getByRole("link", { name: "Contributi" }).click();
    await page.getByRole("button", { name: "Nuova entrata" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuova entrata" });
    await expect(form.getByLabel(/Categoria/)).toHaveValue("Contributi");
    await form.getByLabel(/Nome dell'entrata/).fill("Contributo della Regione");
    await form.getByLabel(/Data/).fill("2026-11-10");
    await form.getByLabel(/Importo in euro/).fill("500");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await form.getByRole("button", { name: "Registra l'entrata" }).click();
    await expect(page.getByText("Entrata registrata")).toBeVisible();
    expect(api.bodies.get("POST /ledger/entries")).toEqual({
      kind: "INCOME",
      description: "Contributo della Regione",
      category: "Contributi",
      amountCents: 50000,
      occurredOn: "2026-11-10",
    });
  });
});

test.describe("altro, bilancio", () => {
  test("shows what happens to the money: totals, how it went, where it comes from and goes, and the report", async ({ page }) => {
    await openAs(page, "/altro/bilancio", ADMIN, ledger());

    await expect(page.getByRole("heading", { level: 1, name: /Cosa succede ai soldi/ })).toBeVisible();
    const sidebar = page.getByRole("navigation", { name: "Sezioni", exact: true });
    // the balance is a page of its own, outside the two lists of movements
    await expect(sidebar.getByRole("link", { name: "Bilancio" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("button", { name: "Movimenti" })).toHaveAttribute("aria-expanded", "false");
    const tiles = page.getByRole("region", { name: "Riepilogo del periodo" });
    await expect(tiles).toContainText(/€\s2240/);
    await expect(tiles).toContainText(/€\s805/);
    await expect(tiles).toContainText(/€\s1435/);

    // the chart, and the same figures as a table
    const chart = page.getByRole("figure", { name: "Entrate e uscite del periodo" });
    await expect(chart).toBeVisible();
    // pointing at a bar shows its figures, and tapping one keeps them: the same readout for the mouse and the finger
    const bars = chart.locator("div[aria-hidden='true'].cursor-pointer");
    await expect(bars).toHaveCount(12);
    await bars.nth(8).hover();
    await expect(chart).toContainText("settembre 2026");
    await expect(chart).toContainText(/Pesa il \d+% delle entrate/);
    await bars.nth(10).click();
    await page.mouse.move(0, 0);
    await expect(chart).toContainText("novembre 2026");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await page.getByRole("button", { name: "Mostra come tabella" }).click();
    await expect(page.getByRole("table")).toContainText("settembre 2026");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await page.getByRole("button", { name: "Mostra come grafico" }).click();

    // where the money comes from and goes: a way into the movements
    const income = page.getByRole("region", { name: "Da dove arrivano i soldi" });
    await expect(income.getByRole("link", { name: "Sponsor" })).toHaveAttribute("href", "/altro/entrate/Sponsor");
    await expect(income.getByRole("link", { name: "Apri le entrate" })).toHaveAttribute("href", "/altro/entrate");
    const costs = page.getByRole("region", { name: "Dove vanno i soldi" });
    await expect(costs.getByRole("link", { name: "Arbitri" })).toHaveAttribute("href", "/altro/uscite/Arbitri");

    // the same period control as the lists of movements
    const period = page.getByRole("group", { name: "Periodo", exact: true });
    await period.getByRole("button", { name: String(new Date().getFullYear()) }).click();
    await expect(page.getByRole("dialog", { name: "Scegli il periodo" }).getByRole("tab")).toHaveCount(4);
    await page.keyboard.press("Escape");

    // the report for the accountant follows the period and has the incomes and the expenses among its sections
    await page.getByRole("button", { name: "Report per il commercialista" }).click();
    const report = page.getByRole("dialog", { name: "Report per il commercialista" });
    await expect(report.getByRole("list", { name: "Sezioni del report" }).getByRole("listitem")).toHaveCount(7);
    await expect(report.getByRole("checkbox", { name: "Entrate" })).toBeChecked();
    await expect(report.getByRole("checkbox", { name: "Uscite" })).toBeChecked();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await report.getByRole("button", { name: "Chiudi", exact: true }).first().click();
    await expect(report).toBeHidden();

    // a category leads to the movements, which lead to the section that produced them
    await income.getByRole("link", { name: "Sponsor" }).click();
    await expect(page).toHaveURL(/\/altro\/entrate\/Sponsor/);
  });
});

const SPONSOR_SUMMARY = { activeCount: 3, activeCents: 450000, expiringCount: 1, prospectCount: 2, expiredCount: 1 };
const sponsors = () =>
  combine(
    ({ method, path }) => (method === "GET" && path === "/sponsors/summary" ? { body: SPONSOR_SUMMARY } : undefined),
    ({ method, path }) => (method === "POST" && path === "/attachments" ? { status: 201, body: { id: "att-1" } } : undefined),
    ({ method, path }) => (method === "GET" && path === "/attachments" ? { body: { data: [] } } : undefined),
    resource("/sponsors", [PANIFICIO]).handler,
  );

test.describe("altro, sponsor", () => {
  test("shows the totals and the cards, and registers a sponsor with its contract attached", async ({ page }) => {
    const api = await openAs(page, "/altro/sponsor", ADMIN, sponsors());

    await expect(page.getByRole("heading", { level: 1, name: /Contratti e scadenze sotto controllo/ })).toBeVisible();
    const sidebar = page.getByRole("navigation", { name: "Sezioni", exact: true });
    await expect(sidebar.getByRole("link", { name: "Sponsor" })).toHaveAttribute("aria-current", "page");
    const tiles = page.getByRole("region", { name: "Riepilogo degli sponsor" });
    await expect(tiles).toContainText(/€\s4\.?500/);
    await expect(tiles).toContainText("In scadenza");
    const card = page.getByRole("list", { name: "Sponsor", exact: true }).getByRole("listitem").filter({ hasText: "Panificio Rizzi" });
    // only what tells sponsors apart: email, end of the contract, state and amount
    await expect(card).toContainText("elena@panificiorizzi.it");
    await expect(card).toContainText("Fino al 31 ago 2027");
    await expect(card).not.toContainText("035 123456");
    await expect(card.getByRole("button")).toHaveCount(1);
    // the contract is an income of the club: the way to it is here
    await expect(page.getByRole("link", { name: "Vedi le entrate degli sponsor" })).toHaveAttribute("href", "/altro/entrate/Sponsor");
    await expect(card).toContainText(/€\s1\.?500/);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    // the card opens the detail on the same page: every field, the attachments and the delete, no Modifica
    await card.getByRole("button", { name: "Panificio Rizzi" }).click();
    const detail = page.getByRole("dialog", { name: "Panificio Rizzi" });
    await expect(detail.getByLabel("Referente")).toHaveValue("Elena Rizzi");
    await expect(detail.getByRole("heading", { name: "Allegati" })).toBeVisible();
    await expect(detail.getByText("Nessun allegato")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Elimina" })).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await detail.getByLabel(/Importo del contratto/).fill("1800");
    await detail.getByRole("button", { name: "Salva le modifiche" }).click();
    await expect(page.getByText("Sponsor aggiornato")).toBeVisible();
    expect(api.bodies.get("PATCH /sponsors/s-panificio")).toMatchObject({ amountCents: 180000 });

    await page.getByRole("button", { name: "Nuovo sponsor" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuovo sponsor" });
    await form.getByLabel(/Nome dello sponsor/).fill("Ottica Bianchi");
    await form.getByLabel(/Importo del contratto/).fill("2000");
    await form.getByLabel("File da allegare").setInputFiles({ name: "contratto.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await expect(form.getByRole("list", { name: "File scelti" })).toContainText("contratto.pdf");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await form.getByRole("button", { name: "Crea lo sponsor" }).click();

    await expect(page.getByText("Sponsor creato")).toBeVisible();
    expect(api.bodies.get("POST /sponsors")).toMatchObject({ name: "Ottica Bianchi", amountCents: 200000, status: "ACTIVE" });
    expect(api.calls).toContain("POST /attachments");
    await expect(page.getByRole("list", { name: "Sponsor", exact: true }).getByRole("listitem").filter({ hasText: "Ottica Bianchi" })).toBeVisible();
  });
});

test.describe("altro su telefono", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  async function expectFits(page: Page): Promise<void> {
    await settle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);
  }

  test("the menu fits a 320px screen, with the topics of the role and touch targets of at least 44px", async ({ page }) => {
    await openAs(page, "/", ADMIN, () => undefined);
    await page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    // Comunicazione is not listed: this role only reads the board, so the topic is a direct link
    for (const topic of ["Persone", "Attività sportiva", "Amministrazione", "Logistica"]) {
      const button = drawer.getByRole("button", { name: topic });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await drawer.getByRole("button", { name: "Logistica" }).click();
    const palestre = drawer.getByRole("link", { name: "Palestre" });
    await expect(palestre).toBeVisible();
    expect((await palestre.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectFits(page);
  });

  test("a list fits 320px, its actions are at least 44px tall and the form dialog scrolls inside the screen", async ({ page }) => {
    await openAs(page, "/altro/palestre", ADMIN, combine(venueSummary, venues().handler, noAttachments));
    const cards = page.getByRole("list", { name: "Palestre", exact: true }).getByRole("listitem");
    await expect(cards).toHaveCount(2);
    await expectFits(page);

    // the whole card is the target, and the new button is as tall as a finger
    expect((await cards.first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole("button", { name: "Nuova palestra" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await cards.first().getByRole("button", { name: "Palazzetto dello Sport" }).click();
    const detail = page.getByRole("dialog", { name: "Palazzetto dello Sport" });
    await expect(detail).toBeVisible();
    await expectFits(page);
    const detailBox = await detail.boundingBox();
    expect((detailBox?.y ?? -1) >= 0 && (detailBox?.y ?? 0) + (detailBox?.height ?? 0) <= 640).toBe(true);
    await expect(detail.getByRole("button", { name: "Salva le modifiche" })).toBeInViewport();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Nuova palestra" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuova palestra" });
    await expect(dialog).toBeVisible();
    await expectFits(page);
    const box = await dialog.boundingBox();
    expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= 640).toBe(true);
    await expect(dialog.getByRole("button", { name: "Crea la palestra" })).toBeInViewport();
  });

  test("uscite fits 320px, with the form dialog inside the screen", async ({ page }) => {
    await openAs(page, "/altro/uscite", ADMIN, ledger());
    await expect(page.getByRole("list", { name: "Categorie", exact: true }).getByRole("listitem")).toHaveCount(2);
    await expectFits(page);
    await page.getByRole("group", { name: "Periodo", exact: true }).getByRole("button", { name: String(new Date().getFullYear()) }).click();
    await expect(page.getByRole("dialog", { name: "Scegli il periodo" })).toBeVisible();
    await expectFits(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Nuova spesa" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuova spesa" });
    await expect(dialog).toBeVisible();
    await expectFits(page);
    const box = await dialog.boundingBox();
    expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= 640).toBe(true);
    await expect(dialog.getByRole("button", { name: "Registra la spesa" })).toBeInViewport();
  });

  test("sponsor fits 320px", async ({ page }) => {
    await openAs(page, "/altro/sponsor", ADMIN, sponsors());
    await expect(page.getByRole("list", { name: "Sponsor", exact: true }).getByRole("listitem")).toHaveCount(1);
    await expectFits(page);
  });

  test("entrate fits 320px, and so does the detail of an income that a section owns", async ({ page }) => {
    await openAs(page, "/altro/entrate/Sponsor", ADMIN, ledger());
    await expect(page.getByRole("list", { name: "Entrate", exact: true }).getByRole("listitem")).toHaveCount(1);
    await expectFits(page);
    await page.getByRole("button", { name: "Ottica Rossi" }).click();
    const detail = page.getByRole("dialog", { name: "Ottica Rossi" });
    await expect(detail).toBeVisible();
    await expectFits(page);
    const box = await detail.boundingBox();
    expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= 640).toBe(true);
  });

  test("bilancio fits 320px, with the chart, the table and the report", async ({ page }) => {
    await openAs(page, "/altro/bilancio", ADMIN, ledger());
    const chart = page.getByRole("figure", { name: "Entrate e uscite del periodo" });
    await expect(chart).toBeVisible();
    await expectFits(page);
    // a tap on a bar shows its figures under the chart, without making the page wider
    await chart.locator("div[aria-hidden='true'].cursor-pointer").nth(8).click();
    await expect(chart).toContainText("settembre 2026");
    await expectFits(page);
    await page.getByRole("button", { name: "Mostra come tabella" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expectFits(page);
    await page.getByRole("button", { name: "Report per il commercialista" }).click();
    await expect(page.getByRole("dialog", { name: "Report per il commercialista" }).getByRole("listitem")).toHaveCount(7);
    await expectFits(page);
  });
});
