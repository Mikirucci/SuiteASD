import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { routeApi, type ApiHandler } from "./support/route-api";

const SOCIETY = {
  id: "s1",
  name: "Aquile Volley",
  slug: "aquile-volley",
  sport: "VOLLEY",
  timezone: "Europe/Rome",
  contactEmail: "info@aquilevolley.it",
  legal: { legalName: "Aquile Volley ASD", legalForm: "ASD", vatNumber: "12345678903" },
};

const PROFILE = {
  userId: "u1",
  firstName: "Michele",
  lastName: "Rucci",
  email: "allenatore@aquilevolley.it",
  phone: "3331234567",
  iban: "IT60X0542811101000000123456",
  fixedFields: [],
  qualifications: [{ id: "q1", title: "Allenatore 2 grado", issuedOn: "2020-01-01", expiresOn: "2099-06-30" }],
};

async function noOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("la società", () => {
  test("the administrator edits the fiscal data and sees the warning on the time zone", async ({ page }) => {
    let society = SOCIETY;
    const handler: ApiHandler = ({ method, path, body }) => {
      if (method === "GET" && path === "/society") return { body: society };
      if (method === "PATCH" && path === "/society") {
        society = { ...society, legal: { ...society.legal, ...(body as { legal: object }).legal } };
        return { body: society };
      }
      return undefined;
    };
    await mockApi(page);
    const api = await routeApi(page, { permissions: ["society:read", "society:readLegal", "society:write"], roles: ["ADMIN"] }, handler);
    await seedStoredSession(page);
    await page.goto("/societa");

    await expect(page.getByRole("heading", { level: 1, name: /Chi è la tua società/ })).toBeVisible();
    await expect(page.getByLabel("Partita IVA")).toHaveValue("12345678903");
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByLabel("Partita IVA").fill("123");
    await page.getByRole("button", { name: "Salva i dati" }).click();
    await expect(page.getByText("La partita IVA ha 11 cifre")).toBeVisible();
    await page.getByLabel("Partita IVA").fill("98765432109");
    await page.getByLabel("Fuso orario").selectOption("Europe/London");
    await expect(page.getByText(/non sposta gli eventi già salvati/)).toBeVisible();
    await page.getByLabel("Fuso orario").selectOption("Europe/Rome");
    await page.getByRole("button", { name: "Salva i dati" }).click();

    await expect(page.getByText("Dati della società salvati")).toBeVisible();
    expect(api.bodies.get("PATCH /society")).toEqual({ legal: { vatNumber: "98765432109" } });
  });

  test("the secretary reads the fiscal data without being able to change them", async ({ page }) => {
    await mockApi(page);
    await routeApi(page, { permissions: ["society:read", "society:readLegal"], roles: ["SEGRETERIA"] }, ({ method, path }) =>
      method === "GET" && path === "/society" ? { body: SOCIETY } : undefined,
    );
    await seedStoredSession(page);
    await page.goto("/societa");

    await expect(page.getByLabel(/^Nome della società/)).toBeDisabled();
    await expect(page.getByLabel("Partita IVA")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Salva i dati" })).toHaveCount(0);
  });

  test("a coach does not get the page: the fiscal data are not for the coaches", async ({ page }) => {
    await mockApi(page);
    const api = await routeApi(page, { permissions: ["society:read"], roles: ["ALLENATORE"] }, () => undefined);
    await seedStoredSession(page);
    await page.goto("/societa");

    await expect(page.getByRole("heading", { name: "Non hai accesso a questa sezione" })).toBeVisible();
    expect(api.calls).not.toContain("GET /society");
  });

  test("fits a 320px screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await mockApi(page);
    await routeApi(page, { permissions: ["society:read", "society:readLegal", "society:write"], roles: ["ADMIN"] }, ({ method, path }) =>
      method === "GET" && path === "/society" ? { body: SOCIETY } : undefined,
    );
    await seedStoredSession(page);
    await page.goto("/societa");
    await expect(page.getByLabel("Partita IVA")).toBeVisible();
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});

test.describe("il mio profilo", () => {
  test("the person fills in their data and adds a qualification, at 320px too", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    let profile = PROFILE;
    const handler: ApiHandler = ({ method, path, body }) => {
      if (method === "GET" && path === "/me/profile") return { body: profile };
      if (method === "PATCH" && path === "/me/profile") {
        profile = { ...profile, ...(body as object) };
        return { body: profile };
      }
      if (method === "GET" && path === "/auth/sessions") return { body: [] };
      if (method === "POST" && path === "/me/qualifications") {
        profile = { ...profile, qualifications: [...profile.qualifications, { id: "q2", title: (body as { title: string }).title, issuedOn: "2020-01-01", expiresOn: "2099-06-30" }] };
        return { status: 201, body: { id: "q2", title: "BLSD" } };
      }
      return undefined;
    };
    await mockApi(page);
    const api = await routeApi(page, { permissions: ["profile:readOwn", "profile:updateOwn", "profile:professional"], roles: ["ALLENATORE"] }, handler);
    await seedStoredSession(page);
    await page.goto("/account");

    await expect(page.getByRole("heading", { level: 1, name: /I tuoi dati e il tuo accesso/ })).toBeVisible();
    await expect(page.getByLabel(/^Telefono/)).toHaveValue("3331234567");
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByLabel(/^Telefono/).fill("3339999999");
    await page.getByRole("button", { name: "Salva i dati" }).click();
    await expect(page.getByText("Dati salvati")).toBeVisible();
    expect(api.bodies.get("PATCH /me/profile")).toEqual({ phone: "3339999999" });

    await page.getByRole("button", { name: "Aggiungi" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nuova qualifica" });
    await dialog.getByLabel(/^Titolo/).fill("BLSD");
    await dialog.getByRole("button", { name: "Aggiungi" }).click();
    await expect(page.getByText("Qualifica aggiunta")).toBeVisible();
    expect(api.calls).toContain("POST /me/qualifications");
  });

  test("an athlete adds an emergency contact for herself in the personal area", async ({ page }) => {
    let contacts: Array<{ id: string; name: string; relation?: string; phone: string }> = [];
    const handler: ApiHandler = ({ method, path, body }) => {
      if (path === "/members/m1/emergency-contacts" && method === "GET") return { body: { data: contacts } };
      if (path === "/members/m1/emergency-contacts" && method === "POST") {
        const input = body as { name: string; phone: string };
        contacts = [{ id: "c1", name: input.name, phone: input.phone }];
        return { status: 201, body: contacts[0] };
      }
      if (method === "GET" && path === "/auth/sessions") return { body: [] };
      return undefined;
    };
    await mockApi(page);
    const api = await routeApi(page, { permissions: ["members:readOwn", "emergencyContacts:updateOwn"], roles: ["ATLETA"], member: { id: "m1", firstName: "Sara", lastName: "Conti" } }, handler);
    await seedStoredSession(page);
    await page.goto("/area-personale/profilo");

    await expect(page.getByRole("heading", { name: "Nessun contatto" })).toBeVisible();
    await page.getByRole("button", { name: "Aggiungi" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nuovo contatto di emergenza" });
    await dialog.getByLabel(/^Nome e cognome/).fill("Anna Conti");
    await dialog.getByLabel(/^Telefono/).fill("3331112222");
    await dialog.getByRole("button", { name: "Aggiungi" }).click();

    await expect(page.getByText("Contatto aggiunto")).toBeVisible();
    expect(api.bodies.get("POST /members/m1/emergency-contacts")).toEqual({ name: "Anna Conti", phone: "3331112222" });
  });
});
