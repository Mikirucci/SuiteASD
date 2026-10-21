import { expect, test, type Page } from "@playwright/test";
import { AFFITTO, ALLENATORE, MAGLIA, PALAZZETTO, PANIFICIO, QUOTE_NOVEMBRE, REPORT, SCUOLA, TRASFERTA, TUTA } from "../src/features/altro/test-fixtures";
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
const NO_ENTRY_DETAILS = { description: null, sponsorId: null, paymentId: null };
const venues = () => resource("/venues", [PALAZZETTO, SCUOLA], { defaults: NO_VENUE_DETAILS });

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

    await sidebar.getByRole("link", { name: "Bilancio" }).click();
    await expect(page).toHaveURL(/\/altro\/bilancio$/);
    await expect(sidebar.getByRole("link", { name: "Bilancio" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("button", { name: "Amministrazione" })).toHaveAttribute("aria-expanded", "true");
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
  });
});

test.describe("altro, palestre", () => {
  test("lists, creates, edits and deletes a venue", async ({ page }) => {
    const store = venues();
    const api = await openAs(page, "/altro/palestre", ADMIN, store.handler);

    await expect(page.getByRole("heading", { level: 1, name: /Dove ci alleniamo e giochiamo/ })).toBeVisible();
    const list = page.getByRole("list", { name: "Palestre", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").filter({ hasText: "Palazzetto dello Sport" })).toContainText("Via dello Sport 12 · Bergamo");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Nuova palestra" }).click();
    const form = page.getByRole("dialog", { name: "Nuova palestra" });
    await form.getByRole("button", { name: "Crea la palestra" }).click();
    await expect(form.getByText("Inserisci il nome della palestra")).toBeVisible();
    await form.getByLabel(/Nome della palestra/).fill("Palestra Comunale");
    await form.getByLabel("Città").fill("Seriate");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await form.getByRole("button", { name: "Crea la palestra" }).click();

    await expect(page.getByText("Palestra creata")).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    expect(api.bodies.get("POST /venues")).toEqual({ name: "Palestra Comunale", city: "Seriate" });

    await pickFromMenu(page, "Altre azioni di Palestra Comunale", "Modifica Palestra Comunale");
    const edit = page.getByRole("dialog", { name: "Modifica la palestra" });
    await edit.getByLabel("Indirizzo").fill("Via Roma 3");
    await edit.getByRole("button", { name: "Salva le modifiche" }).click();
    await expect(page.getByText("Palestra aggiornata")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: "Palestra Comunale" })).toContainText("Via Roma 3 · Seriate");

    await pickFromMenu(page, "Altre azioni di Palestra Comunale", "Elimina Palestra Comunale");
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
    await openAs(page, "/altro/palestre", ADMIN, store.handler);

    const alert = page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile" });
    await expect(alert).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await alert.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("list", { name: "Palestre", exact: true }).getByRole("listitem")).toHaveCount(1);
  });

  test("shows an empty state that explains what to add", async ({ page }) => {
    await openAs(page, "/altro/palestre", ADMIN, resource("/venues", []).handler);
    await expect(page.getByRole("heading", { name: "Nessuna palestra" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuova palestra" })).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("hides the write actions from a role that can only read", async ({ page }) => {
    await openAs(page, "/altro/palestre", READER, venues().handler);
    await expect(page.getByRole("list", { name: "Palestre", exact: true }).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Nuova palestra" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Altre azioni di / })).toHaveCount(0);
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
    { url: "/altro/sponsor", heading: /Contratti e scadenze sotto controllo/, handler: () => resource("/sponsors", [PANIFICIO]).handler, row: "Panificio Rizzi", badge: "Attivo" },
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

test.describe("altro, bilancio", () => {
  const ledger = () =>
    combine(
      resource("/ledger/entries", [QUOTE_NOVEMBRE, AFFITTO], { defaults: NO_ENTRY_DETAILS }).handler,
      ({ method, path }) => (method === "GET" && path === "/ledger/report" ? { body: REPORT } : undefined),
    );

  test("shows the totals and the entries, registers a new entry", async ({ page }) => {
    const api = await openAs(page, "/altro/bilancio", ADMIN, ledger());

    await expect(page.getByRole("heading", { level: 1, name: /Entrate e uscite, chiare/ })).toBeVisible();
    await expect(page.getByText("Saldo", { exact: true }).locator("..")).toContainText(/−\s€\s390/);
    await expect(page.getByRole("region", { name: "Uscite per categoria" })).toContainText("Affitto palestra");
    const list = page.getByRole("list", { name: "Movimenti", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").filter({ hasText: "Quote" })).toContainText("Registrato dai pagamenti");
    await list.getByRole("button", { name: /^Altre azioni di Quote/ }).click();
    await expect(page.getByRole("menuitem", { name: /^Allegati di Quote/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /^Modifica Quote/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Nuovo movimento" }).click();
    const form = page.getByRole("dialog", { name: "Nuovo movimento" });
    await form.getByLabel("Tipo").selectOption("EXPENSE");
    await form.getByLabel("Data").fill("2026-11-10");
    await form.getByLabel(/Categoria/).fill("Arbitri");
    await form.getByLabel(/Importo in euro/).fill("75,50");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await form.getByRole("button", { name: "Registra il movimento" }).click();

    await expect(page.getByText("Movimento registrato")).toBeVisible();
    expect(api.bodies.get("POST /ledger/entries")).toEqual({
      kind: "EXPENSE",
      category: "Arbitri",
      amountCents: 7550,
      occurredOn: "2026-11-10",
    });
    await expect(list.getByRole("listitem")).toHaveCount(3);
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
    await openAs(page, "/altro/palestre", ADMIN, venues().handler);
    await expect(page.getByRole("list", { name: "Palestre", exact: true }).getByRole("listitem")).toHaveCount(2);
    await expectFits(page);

    for (const name of ["Altre azioni di Palazzetto dello Sport", "Nuova palestra"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole("button", { name: "Nuova palestra" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuova palestra" });
    await expect(dialog).toBeVisible();
    await expectFits(page);
    const box = await dialog.boundingBox();
    expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= 640).toBe(true);
    await expect(dialog.getByRole("button", { name: "Crea la palestra" })).toBeInViewport();
  });

  test("bilancio fits 320px", async ({ page }) => {
    await openAs(
      page,
      "/altro/bilancio",
      ADMIN,
      combine(resource("/ledger/entries", [QUOTE_NOVEMBRE, AFFITTO], { defaults: NO_ENTRY_DETAILS }).handler, ({ method, path }) =>
        method === "GET" && path === "/ledger/report" ? { body: REPORT } : undefined,
      ),
    );
    await expect(page.getByRole("list", { name: "Movimenti", exact: true }).getByRole("listitem")).toHaveCount(2);
    await expectFits(page);
  });
});
