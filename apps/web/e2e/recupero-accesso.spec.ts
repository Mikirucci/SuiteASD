import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { routeApi, type ApiHandler } from "./support/route-api";

const NO_CONTENT = { status: 204 } as const;

async function noOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("password dimenticata", () => {
  test("from the login page, asks for the link and gets the same answer whatever the address", async ({ page }) => {
    await mockApi(page);
    const api = await routeApi(page, { permissions: [] }, ({ method, path }) =>
      method === "POST" && path === "/auth/password/forgot" ? NO_CONTENT : undefined,
    );
    await page.goto("/login");
    await page.getByRole("link", { name: "Password dimenticata?" }).click();
    await expect(page).toHaveURL(/\/password\/dimenticata$/);
    await expect(page.getByRole("heading", { level: 1, name: "Password dimenticata" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Mandami il link" }).click();
    await expect(page.getByText("Inserisci un'email valida")).toBeVisible();

    await page.getByLabel(/^Email/).fill("nessuno@example.test");
    await page.getByRole("button", { name: "Mandami il link" }).click();
    await expect(page.getByText("Richiesta inviata")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("nessuno@example.test");
    expect(api.bodies.get("POST /auth/password/forgot")).toEqual({ email: "nessuno@example.test" });
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("fits a 320px screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await mockApi(page);
    await page.goto("/password/dimenticata");
    await expect(page.getByRole("heading", { level: 1, name: "Password dimenticata" })).toBeVisible();
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    const box = await page.getByRole("button", { name: "Mandami il link" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe("nuova password", () => {
  async function fill(page: Page, password: string, confirmation = password) {
    await page.getByLabel(/^Nuova password/).fill(password);
    await page.getByLabel(/^Ripeti la password/).fill(confirmation);
    await page.getByRole("button", { name: "Salva la nuova password" }).click();
  }

  test("saves the password and goes to the sign-in page with a message", async ({ page }) => {
    await mockApi(page);
    const api = await routeApi(page, { permissions: [] }, ({ method, path }) => (method === "POST" && path === "/auth/password/reset" ? NO_CONTENT : undefined));
    await page.goto("/password/reimposta?token=abc");
    await expect(page.getByRole("heading", { level: 1, name: "Scegli una nuova password" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await fill(page, "una-password-lunga", "un-altra-password");
    await expect(page.getByText("Le password non coincidono")).toBeVisible();
    await fill(page, "una-password-lunga");

    await expect(page).toHaveURL(/\/login\?motivo=password-aggiornata$/);
    await expect(page.getByRole("status").filter({ hasText: "Password aggiornata: accedi con la nuova." })).toBeVisible();
    expect(api.bodies.get("POST /auth/password/reset")).toEqual({ token: "abc", newPassword: "una-password-lunga" });
  });

  test("a link that does not work offers a new one", async ({ page }) => {
    await mockApi(page);
    await routeApi(page, { permissions: [] }, ({ method, path }) =>
      method === "POST" && path === "/auth/password/reset" ? { status: 400, body: { type: "about:blank", title: "Bad Request", status: 400, code: "invalid_reset_token" } } : undefined,
    );
    await page.goto("/password/reimposta?token=scaduto");
    await fill(page, "una-password-lunga");

    await expect(page.getByRole("heading", { name: "Link non valido o scaduto" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Richiedi un nuovo link" })).toHaveAttribute("href", "/password/dimenticata");
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("fits a 320px screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await mockApi(page);
    await page.goto("/password/reimposta?token=abc");
    await expect(page.getByRole("heading", { level: 1, name: "Scegli una nuova password" })).toBeVisible();
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("verifica email", () => {
  test("opens the link, verifies once and says it worked", async ({ page }) => {
    await mockApi(page);
    const api = await routeApi(page, { permissions: [] }, ({ method, path }) => (method === "POST" && path === "/auth/email/verify" ? NO_CONTENT : undefined));
    await page.goto("/email/verifica?token=abc");

    await expect(page.getByRole("heading", { name: "Email verificata" })).toBeVisible();
    expect(api.calls.filter((call) => call === "POST /auth/email/verify")).toHaveLength(1);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a link that does not work is explained", async ({ page }) => {
    await mockApi(page);
    await routeApi(page, { permissions: [] }, ({ method, path }) =>
      method === "POST" && path === "/auth/email/verify" ? { status: 400, body: { type: "about:blank", title: "Bad Request", status: 400, code: "invalid_verification_token" } } : undefined,
    );
    await page.goto("/email/verifica?token=vecchio");

    await expect(page.getByRole("heading", { name: "Link non valido o scaduto" })).toBeVisible();
  });

  test("the banner reminds somebody with an unverified email and sends the link again, at 320px too", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await mockApi(page);
    const api = await routeApi(page, { permissions: ["members:read"], roles: ["ADMIN"], emailVerified: false }, ({ method, path }) => {
      if (method === "POST" && path === "/auth/email/resend") return NO_CONTENT;
      return undefined;
    });
    await seedStoredSession(page);
    await page.goto("/");

    const banner = page.getByRole("region", { name: "Verifica la tua email" });
    await expect(banner).toBeVisible();
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    const button = banner.getByRole("button", { name: "Reinvia l'email" });
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(36);
    await button.click();

    await expect(page.getByText("Email inviata")).toBeVisible();
    expect(api.calls).toContain("POST /auth/email/resend");
  });
});

test.describe("dispositivi connessi", () => {
  const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";

  test("lists the devices and signs out of another one after asking", async ({ page }) => {
    let sessions = [
      { id: "s-1", device: CHROME, createdAt: "2026-11-10T08:00:00Z", lastUsedAt: "2026-11-22T09:00:00Z", current: true },
      { id: "s-2", device: IPHONE, createdAt: "2026-11-01T08:00:00Z", lastUsedAt: "2026-11-20T09:00:00Z", current: false },
    ];
    const handler: ApiHandler = ({ method, path }) => {
      if (method === "GET" && path === "/auth/sessions") return { body: sessions };
      if (method === "DELETE" && path === "/auth/sessions/s-2") {
        sessions = sessions.slice(0, 1);
        return NO_CONTENT;
      }
      return undefined;
    };
    await mockApi(page);
    const api = await routeApi(page, { permissions: ["members:readOwn"], roles: ["ATLETA"], member: { id: "m1", firstName: "Anna", lastName: "Conti" } }, handler);
    await seedStoredSession(page);
    await page.goto("/area-personale/profilo");

    const list = page.getByRole("list", { name: "Dispositivi connessi" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).toContainText("Chrome su Windows");
    await expect(list).toContainText("Safari su iPhone");

    await list.getByRole("button", { name: /Safari su iPhone/ }).click();
    const dialog = page.getByRole("dialog", { name: "Uscire da questo dispositivo?" });
    await dialog.getByRole("button", { name: "Esci" }).click();

    await expect(list.getByRole("listitem")).toHaveCount(1);
    expect(api.calls).toContain("DELETE /auth/sessions/s-2");
  });
});
