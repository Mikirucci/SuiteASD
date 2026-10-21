import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiHandler, type RoutedApi } from "./support/route-api";

const DAY_MS = 24 * 60 * 60 * 1000;

interface InvitationFixture {
  id: string;
  email: string | null;
  label: string | null;
  role: string;
  memberId: null;
  expiresAt: string;
  createdAt: string;
}

function invitation(id: string, email: string | null, role: string, label: string | null = null): InvitationFixture {
  const now = Date.now();
  return {
    id,
    email,
    label,
    role,
    memberId: null,
    expiresAt: new Date(now + 5 * DAY_MS).toISOString(),
    createdAt: new Date(now - DAY_MS).toISOString(),
  };
}

const COACH = invitation("inv-1", "marco.allenatore@example.test", "ALLENATORE");

const MANAGER = ["invitations:read", "invitations:write"];

/** Backend with a mutable list of pending invitations. */
function invitationsBackend(initial: InvitationFixture[]): ApiHandler {
  let pending = initial;
  return ({ method, path, body }) => {
    switch (`${method} ${path}`) {
      case "GET /invitations":
        return pageOf(pending);
      case "POST /invitations": {
        const sent = body as { role: string; label?: string };
        const created = invitation("inv-new", null, sent.role, sent.label ?? null);
        pending = [created, ...pending];
        return { status: 201, body: { ...created, token: "tok_E2E-token" } };
      }
      case "DELETE /invitations/inv-1":
        pending = pending.filter((item) => item.id !== "inv-1");
        return { status: 204 };
      default:
        return undefined;
    }
  };
}

async function open(page: Page, path: string, permissions: string[], handler: ApiHandler, withSession = true): Promise<RoutedApi> {
  await mockApi(page);
  const api = await routeApi(page, { permissions, roles: ["ADMIN"] }, handler);
  if (withSession) await seedStoredSession(page);
  await page.goto(path);
  return api;
}

test.describe("inviti", () => {
  test("the admin invites a collaborator, copies the link and later revokes an open invitation", async ({ page }) => {
    const api = await open(page, "/inviti", MANAGER, invitationsBackend([COACH]));

    await expect(page.getByRole("heading", { level: 1, name: /Chi può entrare nella società/ })).toBeVisible();
    const list = page.getByRole("list", { name: "Inviti in attesa" });
    await expect(list).toContainText("marco.allenatore@example.test");
    await expect(list).toContainText("Allenatore · Scade tra 5 giorni");
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Invita una persona" }).click();
    const dialog = page.getByRole("dialog", { name: "Invita una persona" });
    // No email: the platform does not send the link, the person gives their email when joining
    await expect(dialog.getByLabel(/^Email/)).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByLabel(/^Ruolo/).selectOption("STAFF");
    await dialog.getByLabel("Per chi è").fill("Luca, nuovo magazziniere");
    await dialog.getByRole("button", { name: "Crea il link" }).click();

    const result = page.getByRole("dialog", { name: "Link pronto" });
    await expect(result).toContainText("/invito/tok_E2E-token");
    await expect(result).toContainText("Per ora l'app non invia email");
    expect(api.bodies.get("POST /invitations")).toEqual({ role: "STAFF", label: "Luca, nuovo magazziniere" });
    expect(await auditAccessibility(page)).toEqual([]);
    await result.getByRole("button", { name: "Fatto" }).click();
    await expect(list).toContainText("Luca, nuovo magazziniere");

    await page.getByRole("button", { name: "Revoca l'invito: marco.allenatore@example.test" }).click();
    await page.getByRole("dialog", { name: "Revocare l'invito?" }).getByRole("button", { name: "Revoca" }).click();
    await expect(page.getByText("Invito revocato")).toBeVisible();
    await expect(list).not.toContainText("marco.allenatore@example.test");
    expect(api.calls).toContain("DELETE /invitations/inv-1");
  });

  test("without the permission the page says so instead of failing", async ({ page }) => {
    await open(page, "/inviti", [], invitationsBackend([]));
    await expect(page.getByRole("heading", { name: "Non hai accesso a questa sezione" })).toBeVisible();
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, "/inviti", MANAGER, invitationsBackend([COACH]));
    await expect(page.getByRole("list", { name: "Inviti in attesa" })).toContainText("marco.allenatore@example.test");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("invito (pagina pubblica)", () => {
  const SESSION = {
    accessToken: "access-token-9",
    refreshToken: "refresh-token-9",
    tokenType: "Bearer",
    expiresIn: 900,
    user: { id: "u9", email: "marco.allenatore@example.test", firstName: "Marco", lastName: "Bianchi" },
    society: { id: "s1", name: "Aquile Volley" },
    roles: ["ALLENATORE"],
  };

  const INFO = { society: { name: "Aquile Volley" }, role: "ALLENATORE", maskedEmail: "m***@example.test" };
  const gone = (code: string) => ({ status: 410, body: { type: "about:blank", title: "Gone", status: 410, code } });

  test("the invited person sees who invites and as what, sets a password and lands in the administration", async ({ page }) => {
    const api = await open(
      page,
      "/invito/tok_E2E-token",
      [],
      ({ method, path }) => {
        if (`${method} ${path}` === "GET /invitations/tok_E2E-token") return { body: INFO };
        return `${method} ${path}` === "POST /invitations/accept" ? { status: 200, body: SESSION } : undefined;
      },
      false,
    );

    await expect(
      page.getByRole("heading", { level: 1, name: "Sei stato invitato da Aquile Volley come allenatore." }),
    ).toBeVisible();
    await expect(page.getByText(/L'invito è per m\*\*\*@example\.test/)).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Entra nella società" }).click();
    await expect(page.getByText("La password deve avere almeno 8 caratteri")).toBeVisible();

    await page.getByLabel("Nome", { exact: true }).fill("Marco");
    await page.getByLabel("Cognome", { exact: true }).fill("Bianchi");
    await page.getByLabel(/^Password/).fill("una-password-valida");
    await page.getByRole("button", { name: "Entra nella società" }).click();

    await expect(page).toHaveURL("/");
    expect(api.bodies.get("POST /invitations/accept")).toEqual({
      token: "tok_E2E-token",
      password: "una-password-valida",
      firstName: "Marco",
      lastName: "Bianchi",
    });
  });

  test("a link that names nobody asks for the email and creates the access with it", async ({ page }) => {
    const api = await open(
      page,
      "/invito/tok_senza-email",
      [],
      ({ method, path }) => {
        if (`${method} ${path}` === "GET /invitations/tok_senza-email") return { body: { ...INFO, maskedEmail: null } };
        return `${method} ${path}` === "POST /invitations/accept" ? { status: 200, body: SESSION } : undefined;
      },
      false,
    );

    await expect(page.getByText(/Scrivi la tua email e scegli una password/)).toBeVisible();
    await expect(page.getByText(/L'invito è per/)).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Entra nella società" }).click();
    await expect(page.getByText("Inserisci un'email valida")).toBeVisible();

    await page.getByLabel(/^Email/).fill("marco@example.test");
    await page.getByLabel("Nome", { exact: true }).fill("Marco");
    await page.getByLabel("Cognome", { exact: true }).fill("Bianchi");
    await page.getByLabel(/^Password/).fill("una-password-valida");
    await page.getByRole("button", { name: "Entra nella società" }).click();

    await expect(page).toHaveURL("/");
    expect(api.bodies.get("POST /invitations/accept")).toEqual({
      token: "tok_senza-email",
      password: "una-password-valida",
      email: "marco@example.test",
      firstName: "Marco",
      lastName: "Bianchi",
    });
  });

  test("an expired, revoked or used invitation closes the page and says why", async ({ page }) => {
    await open(
      page,
      "/invito/tok_vecchio",
      [],
      ({ method, path }) => (`${method} ${path}` === "GET /invitations/tok_vecchio" ? gone("invitation_expired") : undefined),
      false,
    );
    await expect(page.getByRole("heading", { name: "Invito non utilizzabile" })).toBeVisible();
    await expect(page.getByText(/Questo invito è scaduto/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Entra nella società" })).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("an invitation used while the form was open closes the page on submit", async ({ page }) => {
    await open(
      page,
      "/invito/tok_corsa",
      [],
      ({ method, path }) => {
        if (`${method} ${path}` === "GET /invitations/tok_corsa") return { body: INFO };
        return `${method} ${path}` === "POST /invitations/accept"
          ? { status: 422, body: { type: "about:blank", title: "Error", status: 422, code: "invalid_invitation" } }
          : undefined;
      },
      false,
    );
    await page.getByLabel(/^Password/).fill("una-password-valida");
    await page.getByRole("button", { name: "Entra nella società" }).click();
    await expect(page.getByRole("heading", { name: "Invito non utilizzabile" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
