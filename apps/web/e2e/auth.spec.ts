import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { MOCK, mockApi, seedStoredSession } from "./support/mock-api";
import { routeApi } from "./support/route-api";

test.describe("access control", () => {
  test("a private route sends anonymous users to /login and remembers the destination", async ({ page }) => {
    await mockApi(page);
    await page.goto("/tesserati");
    await expect(page).toHaveURL(/\/login\?next=%2Ftesserati$/);
    await expect(page.getByRole("heading", { level: 1, name: "Bentornato" })).toBeVisible();
  });

  test("a returning user stays signed in after a reload", async ({ page }) => {
    const api = await mockApi(page);
    await seedStoredSession(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();
    expect(api.calls).toContain("POST /auth/refresh");
  });

  test("an authenticated user is redirected away from /login", async ({ page }) => {
    await mockApi(page);
    await seedStoredSession(page);
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });
});

test.describe("login", () => {
  test("has no WCAG A/AA violations", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Bentornato" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("shows validation errors next to the fields", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page.getByText("Inserisci un'email valida")).toBeVisible();
    await expect(page.getByText("Inserisci la password")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("shows a clear message for wrong credentials", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(MOCK.email);
    await page.getByLabel(/^Password/).fill(MOCK.wrongPassword);
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Credenziali non valide" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in, lands on the destination and can log out", async ({ page }) => {
    await mockApi(page);
    await page.goto("/sezione-inesistente");
    await page.getByLabel("Email").fill(MOCK.email);
    await page.getByLabel(/^Password/).fill(MOCK.password);
    await page.getByRole("button", { name: "Accedi" }).click();

    await expect(page).toHaveURL("/sezione-inesistente");
    await expect(page.getByRole("heading", { level: 1, name: "Questa pagina non è ancora disponibile" })).toBeVisible();
    const sidebar = page.getByRole("navigation", { name: "Sezioni" });
    await expect(sidebar.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(sidebar.locator("[aria-current='page']")).toHaveCount(0);

    await page.getByRole("button", { name: "Esci" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: "Bentornato" })).toBeVisible();
  });

  test("password can be revealed", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");
    const password = page.getByLabel(/^Password/);
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Mostra password" }).click();
    await expect(password).toHaveAttribute("type", "text");
  });
});

test.describe("society registration", () => {
  async function fillSociety(page: Page) {
    await page.getByLabel("Nome della società").fill("Aquile Volley");
    await page.getByRole("button", { name: "Continua" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Il tuo accesso" })).toBeFocused();
  }

  async function fillAccess(page: Page, email: string, confirmation: string) {
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Michele");
    await page.getByLabel("Cognome").fill("Rucci");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill(MOCK.password);
    await page.getByLabel(/^Ripeti la password/).fill(confirmation);
  }

  test("explains the two steps and what happens next", async ({ page }) => {
    await mockApi(page);
    await page.goto("/registrazione");
    await expect(page.getByText("Passo 1 di 2")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "La tua società" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Cosa succede dopo" }).getByRole("listitem")).toHaveCount(3);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("validates each step before moving on and before sending", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/registrazione");
    await page.getByRole("button", { name: "Continua" }).click();
    await expect(page.getByText("Il nome della società deve avere almeno 2 caratteri")).toBeVisible();
    await expect(page.getByText("Passo 1 di 2")).toBeVisible();

    await fillSociety(page);
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page.getByText("Inserisci il nome")).toBeVisible();

    await fillAccess(page, MOCK.email, "un-altra-password");
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page.getByText("Le password non coincidono")).toBeVisible();
    expect(api.calls).not.toContain("POST /auth/register");
  });

  test("keeps the society name when going back from the access step", async ({ page }) => {
    await mockApi(page);
    await page.goto("/registrazione");
    await fillSociety(page);
    await page.getByRole("button", { name: "Indietro" }).click();
    await expect(page.getByLabel("Nome della società")).toHaveValue("Aquile Volley");
  });

  test("reports an email that is already registered on the email field", async ({ page }) => {
    await mockApi(page);
    await page.goto("/registrazione");
    await fillSociety(page);
    await fillAccess(page, MOCK.takenEmail, MOCK.password);
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page.getByText("Esiste già un account con questa email")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("creates the society and opens the app", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/registrazione");
    await fillSociety(page);
    await fillAccess(page, MOCK.email, MOCK.password);
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();
    expect(api.calls).toContain("POST /auth/register");
  });

  test("fits a 320px phone without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await mockApi(page);
    await page.goto("/registrazione");
    await fillSociety(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("app shell on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("uses the bottom bar and a menu drawer with the topic groups instead of the sidebar", async ({ page }) => {
    await mockApi(page);
    await routeApi(page, { roles: ["ADMIN"], permissions: ["members:read", "events:read", "payments:read", "automations:read", "notifications:readOwn"] }, () => undefined);
    await seedStoredSession(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();

    const bar = page.getByRole("navigation", { name: "Navigazione principale" });
    await expect(bar).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sezioni", exact: true })).toBeHidden();

    await expect(bar.getByRole("link")).toHaveText(["Home", "Tesserati", "Calendario", "Pagamenti"]);
    await bar.getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer.getByRole("link", { name: "Automazioni" })).toBeHidden();
    await drawer.getByRole("button", { name: "Comunicazione" }).click();
    await expect(drawer.getByRole("link", { name: "Automazioni" })).toBeVisible();
    await drawer.getByRole("link", { name: "Automazioni" }).click();
    await expect(page).toHaveURL("/automazioni");
    await expect(drawer).toBeHidden();
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await mockApi(page);
    await seedStoredSession(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
