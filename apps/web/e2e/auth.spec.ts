import { expect, test } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { MOCK, mockApi, seedStoredSession } from "./support/mock-api";

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
    await expect(sidebar.getByRole("link", { name: "Calendario" })).not.toHaveAttribute("aria-current", "page");

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
  test("validates the form before sending it", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/registrazione");
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page.getByText("Il nome della società deve avere almeno 2 caratteri")).toBeVisible();
    await expect(page.getByText("Inserisci il nome")).toBeVisible();

    await page.getByLabel("Nome della società").fill("Aquile Volley");
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Michele");
    await page.getByLabel("Cognome").fill("Rucci");
    await page.getByLabel("Email").fill(MOCK.email);
    await page.getByLabel(/^Password/).fill(MOCK.password);
    await page.getByLabel(/^Ripeti la password/).fill("un-altra-password");
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page.getByText("Le password non coincidono")).toBeVisible();
    expect(api.calls).not.toContain("POST /auth/register");
  });

  test("reports an email that is already registered on the email field", async ({ page }) => {
    await mockApi(page);
    await page.goto("/registrazione");
    await page.getByLabel("Nome della società").fill("Aquile Volley");
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Michele");
    await page.getByLabel("Cognome").fill("Rucci");
    await page.getByLabel("Email").fill(MOCK.takenEmail);
    await page.getByLabel(/^Password/).fill(MOCK.password);
    await page.getByLabel(/^Ripeti la password/).fill(MOCK.password);
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page.getByText("Esiste già un account con questa email")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("creates the society and opens the app", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/registrazione");
    await page.getByLabel("Nome della società").fill("Aquile Volley");
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Michele");
    await page.getByLabel("Cognome").fill("Rucci");
    await page.getByLabel("Email").fill(MOCK.email);
    await page.getByLabel(/^Password/).fill(MOCK.password);
    await page.getByLabel(/^Ripeti la password/).fill(MOCK.password);
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();
    expect(api.calls).toContain("POST /auth/register");
  });
});

test.describe("app shell on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("uses the bottom bar and a menu drawer instead of the sidebar", async ({ page }) => {
    await mockApi(page);
    await seedStoredSession(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Michele/ })).toBeVisible();

    const bar = page.getByRole("navigation", { name: "Navigazione principale" });
    await expect(bar).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sezioni", exact: true })).toBeHidden();

    await bar.getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
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
