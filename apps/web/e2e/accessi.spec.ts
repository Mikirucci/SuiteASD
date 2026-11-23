import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiHandler } from "./support/route-api";

interface AccountFixture {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: null;
  isActive: boolean;
  roles: string[];
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  member: null;
}

function account(id: string, firstName: string, lastName: string, roles: string[], overrides: Partial<AccountFixture> = {}): AccountFixture {
  return {
    id,
    email: `${firstName.toLowerCase()}@aquilevolley.it`,
    firstName,
    lastName,
    phone: null,
    isActive: true,
    roles,
    emailVerified: true,
    createdAt: "2026-03-02T09:14:00Z",
    lastLoginAt: "2026-11-20T18:02:00Z",
    member: null,
    ...overrides,
  };
}

const ADMIN_PERMISSIONS = ["invitations:read", "invitations:write", "users:read", "users:write", "users:auditRead"];

function backend(initial: AccountFixture[]): ApiHandler {
  let accounts = initial;
  return ({ method, path, body }) => {
    if (method === "GET" && path === "/invitations") return pageOf([]);
    if (method === "GET" && path === "/users") return pageOf(accounts);
    const roles = /^\/users\/([^/]+)\/roles$/.exec(path);
    if (method === "PUT" && roles) {
      accounts = accounts.map((item) => (item.id === roles[1] ? { ...item, roles: (body as { roles: string[] }).roles } : item));
      return { body: accounts.find((item) => item.id === roles[1]) };
    }
    const deactivate = /^\/users\/([^/]+)\/deactivate$/.exec(path);
    if (method === "POST" && deactivate) {
      accounts = accounts.map((item) => (item.id === deactivate[1] ? { ...item, isActive: false } : item));
      return { body: accounts.find((item) => item.id === deactivate[1]) };
    }
    return undefined;
  };
}

async function open(page: Page, handler: ApiHandler, permissions = ADMIN_PERMISSIONS) {
  await mockApi(page);
  const api = await routeApi(page, { permissions, roles: ["ADMIN"] }, handler);
  await seedStoredSession(page);
  await page.goto("/inviti");
  return api;
}

test.describe("persone con accesso", () => {
  const PEOPLE = [account("u1", "Michele", "Rucci", ["ADMIN"]), account("u2", "Marco", "Rossi", ["ALLENATORE"]), account("u3", "Luca", "Neri", ["STAFF"], { isActive: false })];

  test("the administrator changes the roles of a person and disables another", async ({ page }) => {
    const api = await open(page, backend(PEOPLE));
    const list = page.getByRole("list", { name: "Persone con accesso" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list).toContainText("Disattivato");
    expect(await auditAccessibility(page)).toEqual([]);

    await list.getByRole("button", { name: "Cambia i ruoli di Marco Rossi" }).click();
    const dialog = page.getByRole("dialog", { name: "Cambia i ruoli" });
    await dialog.getByRole("checkbox", { name: /Segreteria/ }).check();
    expect(await auditAccessibility(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Salva i ruoli" }).click();
    await expect(page.getByText("Ruoli aggiornati")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: "Marco Rossi" })).toContainText("Segreteria");
    expect(api.bodies.get("PUT /users/u2/roles")).toEqual({ roles: ["SEGRETERIA", "ALLENATORE"] });

    await list.getByRole("button", { name: "Disattiva l'account di Marco Rossi" }).click();
    await page.getByRole("dialog", { name: "Disattivare l'account?" }).getByRole("button", { name: "Disattiva" }).click();
    await expect(list.getByRole("listitem").filter({ hasText: "Marco Rossi" })).toContainText("Disattivato");
  });

  test("the secretary reads the list without the actions to change it", async ({ page }) => {
    await open(page, backend(PEOPLE), ["invitations:read", "invitations:write", "users:read"]);
    const list = page.getByRole("list", { name: "Persone con accesso" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByRole("button")).toHaveCount(0);
  });

  test("fits a 320px screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, backend(PEOPLE));
    await expect(page.getByRole("list", { name: "Persone con accesso" }).getByRole("listitem")).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
