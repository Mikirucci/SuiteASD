import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiHandler, type RoutedApi } from "./support/route-api";

interface PromotionFixture {
  id: string;
  title: string;
  partnerName: string;
  partnerLabel: string | null;
  city: string | null;
  badge: string | null;
  terms: string | null;
  template: string;
  validFrom: string;
  validTo: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
  allMembers: boolean;
  teamIds: string[];
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

function promotion(overrides: Partial<PromotionFixture> & Pick<PromotionFixture, "id" | "title">): PromotionFixture {
  return {
    partnerName: "Therapia",
    partnerLabel: "Medical partner",
    city: "Bitonto",
    badge: "Sconti",
    terms: "10% su ogni seduta",
    template: "OCEANO",
    validFrom: "2026-09-01",
    validTo: "2027-05-31",
    status: "PUBLISHED",
    publishedAt: "2026-09-02T08:00:00.000Z",
    allMembers: false,
    teamIds: ["t16"],
    roles: [],
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-02T08:00:00.000Z",
    ...overrides,
  };
}

const TEAMS = [
  { id: "t16", name: "Under 16", category: "U16", sport: "VOLLEY", gender: "FEMALE", description: null, seasonId: null, membersCount: 14, createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z" },
];
const ADMIN = ["promotions:read", "promotions:write", "promotions:readOwn", "teams:read"];

/** Backend with a mutable list: writes show up in the next GET, like the real API. */
function promotionsBackend(initial: PromotionFixture[]): ApiHandler {
  let promotions = initial;
  return ({ method, path, body }) => {
    switch (`${method} ${path}`) {
      case "GET /promotions":
        return pageOf(promotions);
      case "GET /teams":
        return pageOf(TEAMS);
      case "POST /promotions": {
        const created = promotion({ id: "p-new", status: "DRAFT", publishedAt: null, ...(body as { title: string }) });
        promotions = [...promotions, created];
        return { status: 201, body: created };
      }
      case "POST /promotions/p-bozza/publish":
        promotions = promotions.map((item) => (item.id === "p-bozza" ? { ...item, status: "PUBLISHED" as const } : item));
        return { body: promotions.find((item) => item.id === "p-bozza") };
      default:
        return undefined;
    }
  };
}

async function open(page: Page, path: string, permissions: string[], handler: ApiHandler): Promise<RoutedApi> {
  await mockApi(page);
  const api = await routeApi(page, { permissions, roles: ["ADMIN"] }, handler);
  await seedStoredSession(page);
  await page.goto(path);
  return api;
}

test.describe("convenzioni, amministrazione", () => {
  test("the admin creates the first promotion from the empty page, with the preview following what is typed", async ({ page }) => {
    const api = await open(page, "/convenzioni", ADMIN, promotionsBackend([]));

    await expect(page.getByRole("heading", { level: 1, name: /Le convenzioni con i partner/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nessuna convenzione ancora" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Nuova convenzione" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuova convenzione" });
    await dialog.getByRole("button", { name: "Salva la bozza" }).click();
    await expect(dialog.getByText("Inserisci il titolo della convenzione")).toBeVisible();

    await dialog.getByLabel(/^Titolo della convenzione/).fill("Osteopatia");
    await dialog.getByLabel(/^Nome del partner/).fill("Studio Rossi");
    await expect(dialog.getByRole("article", { name: "Card Osteopatia" })).toContainText("Studio Rossi");
    await dialog.getByRole("radio", { name: "Notte" }).click();
    await dialog.getByRole("checkbox", { name: "Squadra Under 16" }).check();
    expect(await auditAccessibility(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Salva la bozza" }).click();

    await expect(page.getByText("Bozza salvata")).toBeVisible();
    await expect(page.getByRole("list", { name: "Convenzioni" })).toContainText("Osteopatia");
    expect(api.bodies.get("POST /promotions")).toMatchObject({ title: "Osteopatia", template: "NOTTE", teamIds: ["t16"], allMembers: false });
  });

  test("lists the promotions with their status and publishes a draft after the confirmation", async ({ page }) => {
    const draft = promotion({ id: "p-bozza", title: "Palestra convenzionata", status: "DRAFT", publishedAt: null, allMembers: true, teamIds: [] });
    const api = await open(page, "/convenzioni", ADMIN, promotionsBackend([promotion({ id: "p-fisio", title: "Fisioterapia scontata" }), draft]));

    const list = page.getByRole("list", { name: "Convenzioni" });
    await expect(list).toContainText("Per: Under 16");
    await expect(list).toContainText("Per: Tutti i tesserati");
    expect(await auditAccessibility(page)).toEqual([]);

    const draftItem = list.getByRole("listitem").filter({ hasText: "Palestra convenzionata" });
    await draftItem.getByRole("button", { name: "Pubblica" }).click();
    const confirm = page.getByRole("dialog", { name: "Pubblicare la convenzione?" });
    await expect(confirm).toContainText("ne viene avvisato con una notifica e un'email");
    await confirm.getByRole("button", { name: "Pubblica" }).click();

    await expect(page.getByText("Convenzione pubblicata")).toBeVisible();
    await expect(draftItem).toContainText("Pubblicata");
    expect(api.calls).toContain("POST /promotions/p-bozza/publish");
  });

  test("a reader sees the promotions without the actions to change them", async ({ page }) => {
    await open(page, "/convenzioni", ["promotions:read", "promotions:readOwn", "teams:read"], promotionsBackend([promotion({ id: "p-fisio", title: "Fisioterapia scontata" })]));
    await expect(page.getByRole("list", { name: "Convenzioni" })).toContainText("Fisioterapia scontata");
    await expect(page.getByRole("button", { name: "Nuova convenzione" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archivia" })).toHaveCount(0);
  });
});

test.describe("convenzioni, le mie card", () => {
  const card = {
    promotionId: "p-fisio",
    title: "Fisioterapia scontata",
    partnerName: "Therapia",
    partnerLabel: "Medical partner",
    city: "Bitonto",
    badge: "Sconti",
    terms: "10% su ogni seduta",
    template: "OCEANO",
    validFrom: "2026-09-01",
    validTo: "2027-05-31",
    state: "ACTIVE",
    societyName: "Aquile Volley",
    holderName: "Anna Conti",
    holderMemberId: "m-anna",
    representedBy: "Michele Rucci",
  };

  test("a guardian finds one card for each child with both names and opens its details", async ({ page }) => {
    await open(page, "/convenzioni/mie", ["promotions:readOwn"], ({ method, path }) =>
      method === "GET" && path === "/me/promotions" ? { body: { data: [card, { ...card, holderName: "Luca Conti", holderMemberId: "m-luca" }] } } : undefined,
    );

    const list = page.getByRole("list", { name: "Convenzioni" });
    await expect(list.getByRole("article")).toHaveCount(2);
    await expect(list).toContainText("Anna Conti");
    await expect(list).toContainText("Genitore: Michele Rucci");
    expect(await auditAccessibility(page)).toEqual([]);

    await list.getByRole("button", { name: /Mostra i dettagli.*Anna Conti/ }).click();
    await expect(page.getByRole("dialog", { name: "Fisioterapia scontata" })).toContainText("10% su ogni seduta");
  });

  test("says what to expect when there is no card", async ({ page }) => {
    await open(page, "/convenzioni/mie", ["promotions:readOwn"], ({ method, path }) => (method === "GET" && path === "/me/promotions" ? { body: { data: [] } } : undefined));
    await expect(page.getByRole("heading", { name: "Nessuna convenzione per ora" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
