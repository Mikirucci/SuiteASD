import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { demoMembers } from "./support/tesserati-fixtures";
import { pageOf, routeApi, type ApiAnswer, type ApiHandler, type RoutedApi } from "./support/route-api";

interface TeamFixture {
  id: string;
  name: string;
  category: string | null;
  sport: "VOLLEY";
  gender: "FEMALE" | "MALE" | "MIXED" | null;
  description: string | null;
  seasonId: string | null;
  membersCount: number;
  createdAt: string;
  updatedAt: string;
}

function team(overrides: Partial<TeamFixture> & Pick<TeamFixture, "id" | "name">): TeamFixture {
  return {
    category: null,
    sport: "VOLLEY",
    gender: null,
    description: null,
    seasonId: null,
    membersCount: 0,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

const U16 = team({ id: "t16", name: "Under 16", category: "U16", gender: "FEMALE", membersCount: 14 });
const SERIE_D = team({ id: "td", name: "Serie D", category: "Serie D", gender: "MIXED", membersCount: 9 });

const ADMIN = ["teams:read", "teams:write"];

/** Backend with a mutable list of teams: writes show up in the next GET, like the real API. */
function teamsBackend(initial: TeamFixture[], listAnswer?: () => ApiAnswer): ApiHandler {
  let teams = initial;
  return ({ method, path, body }) => {
    switch (`${method} ${path}`) {
      case "GET /teams":
        return listAnswer ? listAnswer() : pageOf(teams);
      case "POST /teams": {
        const created = team({ id: "t-new", ...(body as { name: string; category?: string }) });
        teams = [...teams, created];
        return { status: 201, body: created };
      }
      case "DELETE /teams/t16":
        teams = teams.filter((item) => item.id !== "t16");
        return { status: 204 };
      default:
        return undefined;
    }
  };
}

async function open(page: Page, permissions: string[], handler: ApiHandler): Promise<RoutedApi> {
  await mockApi(page);
  const api = await routeApi(page, { permissions, roles: ["ADMIN"] }, handler);
  await seedStoredSession(page);
  await page.goto("/squadre");
  return api;
}

test.describe("squadre", () => {
  test("the admin creates the first team from the empty page", async ({ page }) => {
    const api = await open(page, ADMIN, teamsBackend([]));

    await expect(page.getByRole("heading", { level: 1, name: /Le squadre della società/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nessuna squadra ancora" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Nuova squadra" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuova squadra" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Crea squadra" }).click();
    await expect(dialog.getByText("Inserisci il nome della squadra")).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByLabel(/^Nome/).fill("Under 14");
    await dialog.getByLabel("Categoria").fill("U14");
    await dialog.getByRole("button", { name: "Crea squadra" }).click();

    await expect(page.getByText("Squadra creata")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("list", { name: "Squadre" })).toContainText("Under 14");
    expect(api.bodies.get("POST /teams")).toEqual({ name: "Under 14", category: "U14" });
  });

  test("lists the teams and deletes one after the confirmation", async ({ page }) => {
    const api = await open(page, ADMIN, teamsBackend([U16, SERIE_D]));

    const list = page.getByRole("list", { name: "Squadre" });
    await expect(list).toContainText("14 tesserati");
    await expect(list).toContainText("Femminile");
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Elimina Under 16" }).click();
    const confirm = page.getByRole("dialog", { name: "Eliminare Under 16?" });
    await expect(confirm).toContainText("14 tesserati restano in società ma escono dalla squadra");
    await confirm.getByRole("button", { name: "Elimina" }).click();

    await expect(page.getByText("Squadra eliminata")).toBeVisible();
    await expect(list).not.toContainText("Under 16");
    expect(api.calls).toContain("DELETE /teams/t16");
  });

  test("a reader sees the teams without the actions to change them", async ({ page }) => {
    await open(page, ["teams:read"], teamsBackend([U16]));
    await expect(page.getByRole("list", { name: "Squadre" })).toContainText("Under 16");
    await expect(page.getByRole("button", { name: "Nuova squadra" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Modifica/ })).toHaveCount(0);
  });

  test("a failed load shows an error and retrying recovers", async ({ page }) => {
    let failures = 3; // first attempt plus the two automatic retries of React Query
    await open(
      page,
      ADMIN,
      teamsBackend([U16], () => {
        if (failures > 0) {
          failures -= 1;
          return { status: 500, body: { type: "about:blank", title: "Error", status: 500, code: "internal" } };
        }
        return pageOf([U16]);
      }),
    );
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("list", { name: "Squadre" })).toContainText("Under 16");
  });

  test("adds several athletes from the team page: search, tick, one request", async ({ page }) => {
    const inTeam = { id: "t16", name: "Under 16", category: "U16", position: null, jerseyNumber: null };
    let everyone = demoMembers().map((item) => ({ ...item, teams: item.id === "m-sara" ? [inTeam] : [] }));
    const handler: ApiHandler = ({ method, path, query, body }) => {
      switch (`${method} ${path}`) {
        case "GET /teams/t16":
          return { body: U16 };
        case "GET /members": {
          const needle = (query.get("q") ?? "").toLowerCase();
          const matching = everyone.filter(
            (item) =>
              (!needle || `${item.firstName} ${item.lastName}`.toLowerCase().includes(needle)) &&
              (!query.get("teamId") || item.teams.some((ref) => ref.id === query.get("teamId"))),
          );
          return pageOf(matching.slice(0, 25));
        }
        case "POST /teams/t16/members": {
          const ids = (body as { memberIds: string[] }).memberIds;
          everyone = everyone.map((item) => (ids.includes(item.id) ? { ...item, teams: [inTeam] } : item));
          return { body: { added: ids.length, alreadyInTeam: 0 } };
        }
        default:
          return undefined;
      }
    };
    await mockApi(page);
    const api = await routeApi(page, { permissions: [...ADMIN, "members:read"], roles: ["ADMIN"] }, handler);
    await seedStoredSession(page);
    await page.goto("/squadre/t16");

    const roster = page.getByRole("table", { name: "Rosa di Under 16" });
    await expect(roster.getByRole("link", { name: "Sara Conti" })).toBeVisible();
    await expect(roster.getByRole("link", { name: "Elena Russo" })).toHaveCount(0);

    await page.getByRole("button", { name: "Aggiungi atleti" }).click();
    const dialog = page.getByRole("dialog", { name: "Aggiungi atleti a Under 16" });
    await expect(dialog.getByRole("searchbox", { name: "Cerca tesserato" })).toBeFocused();
    await expect(dialog.getByRole("checkbox", { name: /Sara Conti/ })).toBeDisabled();
    await expect(dialog.getByText("Già in squadra")).toBeVisible();

    await dialog.getByRole("searchbox", { name: "Cerca tesserato" }).fill("russo");
    await dialog.getByText("Elena Russo").click();
    await dialog.getByRole("searchbox", { name: "Cerca tesserato" }).fill("neri");
    await dialog.getByText("Chiara Neri").click();
    await page.waitForTimeout(500);
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByRole("button", { name: "Aggiungi 2 atleti" }).click();
    await expect(page.getByText("2 atleti aggiunti")).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(api.bodies.get("POST /teams/t16/members")).toEqual({ memberIds: ["m-elena", "m-chiara"] });
    await expect(roster.getByRole("link", { name: "Elena Russo" })).toBeVisible();
    await expect(roster.getByRole("link", { name: "Chiara Neri" })).toBeVisible();
  });

  test("the roster shows every column in full, one line per athlete, and the cards sit above it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const inTeam = { id: "t16", name: "Under 16", category: "U16", position: "Palleggiatrice", jerseyNumber: 12 };
    const roster = demoMembers().map((item) => ({ ...item, teams: [inTeam] }));
    await mockApi(page);
    await routeApi(
      page,
      { permissions: [...ADMIN, "members:read", "events:read"], roles: ["ADMIN"] },
      ({ method, path }) => {
        if (method !== "GET") return undefined;
        if (path === "/teams/t16") return { body: U16 };
        if (path === "/members") return pageOf(roster.slice(0, 25));
        if (path === "/events") return pageOf([]);
        return undefined;
      },
    );
    await seedStoredSession(page);
    await page.goto("/squadre/t16");

    const table = page.getByRole("table", { name: "Rosa di Under 16" });
    await expect(table.getByRole("row")).toHaveCount(26);
    const heights = await table.getByRole("row").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    // A wrapped name or chip would make its row taller than the others
    expect(Math.max(...heights.slice(1)) - Math.min(...heights.slice(1))).toBeLessThanOrEqual(2);
    const clipped = await table.evaluate((element) => {
      const holder = element.parentElement as HTMLElement;
      return holder.scrollWidth - holder.clientWidth;
    });
    expect(clipped).toBeLessThanOrEqual(0);

    // The appointments come before the roster: the table gets the whole width
    const appointments = page.getByRole("heading", { name: "Prossimi appuntamenti" });
    const rosterHeading = page.getByRole("heading", { name: "Rosa" });
    const [top, rosterTop] = [await appointments.boundingBox(), await rosterHeading.boundingBox()];
    expect(top?.y ?? 0).toBeLessThan(rosterTop?.y ?? 0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, ADMIN, teamsBackend([U16, SERIE_D]));
    await expect(page.getByRole("list", { name: "Squadre" })).toContainText("Serie D");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
