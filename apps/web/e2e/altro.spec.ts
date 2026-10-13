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

test.describe("altro, hub", () => {
  test("shows the 12 sections and each one leads to its page, without accessibility violations", async ({ page }) => {
    await openAs(page, "/altro", ADMIN, () => undefined);

    await expect(page.getByRole("heading", { level: 1, name: /Tutto quello che serve, in un posto solo/ })).toBeVisible();
    const grid = page.getByRole("list", { name: "Sezioni" });
    await expect(grid.getByRole("link")).toHaveCount(12);
    await expect(grid.getByRole("link", { name: /Presenze/ })).toHaveAttribute("href", "/calendario/presenze");
    await expect(grid.getByRole("link", { name: /Documenti/ })).toHaveAttribute("href", "/scadenze");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await grid.getByRole("link", { name: /Bilancio/ }).click();
    await expect(page).toHaveURL(/\/altro\/bilancio$/);
  });

  test("shows only the sections the role can read", async ({ page }) => {
    await openAs(page, "/altro", READER, () => undefined);
    const grid = page.getByRole("list", { name: "Sezioni" });
    await expect(grid.getByRole("link")).toHaveCount(4);
    await expect(grid.getByRole("link", { name: /Sponsor/ })).toHaveCount(0);
    await expect(grid.getByRole("link", { name: /Bilancio/ })).toHaveCount(0);
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

    await page.getByRole("button", { name: "Modifica Palestra Comunale" }).click();
    const edit = page.getByRole("dialog", { name: "Modifica la palestra" });
    await edit.getByLabel("Indirizzo").fill("Via Roma 3");
    await edit.getByRole("button", { name: "Salva le modifiche" }).click();
    await expect(page.getByText("Palestra aggiornata")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: "Palestra Comunale" })).toContainText("Via Roma 3 · Seriate");

    await page.getByRole("button", { name: "Elimina Palestra Comunale" }).click();
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
    await expect(page.getByRole("button", { name: /^Modifica / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Elimina / })).toHaveCount(0);
  });
});

test.describe("altro, altre pagine", () => {
  const pages = [
    { url: "/altro/trasferte", heading: /Chi parte, con cosa e quanto costa/, handler: () => resource("/trips", [TRASFERTA]).handler, row: "Palasport Delfini, Verona", badge: "Confermata" },
    { url: "/altro/divise", heading: /Ogni maglia al suo posto/, handler: () => resource("/kits", [MAGLIA, TUTA]).handler, row: "Maglia gara · S · n. 7", badge: "Assegnato" },
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
    const api = await openAs(page, "/altro/divise", ADMIN, combine(kits.handler, members));

    await page.getByRole("button", { name: /^Modifica Tuta/ }).click();
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
    await expect(list.getByRole("listitem").filter({ hasText: "Quote" })).toContainText("Registrato dalle quote");
    await expect(list.getByRole("button", { name: /Modifica Quote/ })).toHaveCount(0);
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

  test("the hub fits a 320px screen", async ({ page }) => {
    await openAs(page, "/altro", ADMIN, () => undefined);
    await expect(page.getByRole("list", { name: "Sezioni" }).getByRole("link")).toHaveCount(12);
    await expectFits(page);
  });

  test("a list fits 320px, its actions are at least 44px tall and the form dialog scrolls inside the screen", async ({ page }) => {
    await openAs(page, "/altro/palestre", ADMIN, venues().handler);
    await expect(page.getByRole("list", { name: "Palestre", exact: true }).getByRole("listitem")).toHaveCount(2);
    await expectFits(page);

    for (const name of ["Modifica Palazzetto dello Sport", "Elimina Palazzetto dello Sport", "Nuova palestra"]) {
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
