import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiAnswer, type ApiHandler } from "./support/route-api";
import { announcement, DRAFT, PINNED, TEAMS, TEAM_NOTICE } from "../src/features/bacheca/test-fixtures";
import type { Announcement } from "../src/features/bacheca/types";
import { BIANCHI, NO_FEE, REIMBURSED, TO_REIMBURSE, VERDI } from "../src/features/arbitri/test-fixtures";
import { OVERVIEW } from "../src/features/statistiche/test-fixtures";
import { POOL_A, POOL_B, SEASON, STANDINGS_A, STANDINGS_B, TOURNAMENT } from "../src/features/tornei/test-fixtures";

const SERVER_ERROR: ApiAnswer = { status: 500, body: { type: "about:blank", title: "Error", status: 500, code: "internal" } };

/** A GET that fails `times` times (first attempt plus the two automatic retries of React Query), then answers. */
function failing(times: number, answer: () => ApiAnswer): () => ApiAnswer {
  let left = times;
  return () => {
    if (left > 0) {
      left -= 1;
      return SERVER_ERROR;
    }
    return answer();
  };
}

async function open(page: Page, path: string, permissions: string[], handler: ApiHandler) {
  await mockApi(page);
  const api = await routeApi(page, { permissions }, handler);
  await seedStoredSession(page);
  await page.goto(path);
  return api;
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("statistiche", () => {
  const handler = (answer: () => ApiAnswer = () => ({ body: OVERVIEW })): ApiHandler => ({ method, path }) =>
    `${method} ${path}` === "GET /statistics/overview" ? answer() : undefined;

  test("shows the society dashboard, with the table alternative of the chart", async ({ page }) => {
    await open(page, "/altro/statistiche", ["statistics:read"], handler());

    await expect(page.getByRole("heading", { level: 1, name: /La società in un colpo d'occhio/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tesserati per squadra" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "U16" })).toHaveAttribute("aria-valuenow", "28");
    await expect(page.getByRole("region", { name: "Certificati medici" })).toContainText("In scadenza");
    await expect(page.getByRole("list", { name: "Ultimi risultati" })).toContainText("Aquile Volley - Falchi Volley");
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Mostra come tabella" }).click();
    await expect(page.getByRole("table", { name: "Tesserati per squadra" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a failed load shows an error and retrying recovers", async ({ page }) => {
    await open(page, "/altro/statistiche", ["statistics:read"], handler(failing(3, () => ({ body: OVERVIEW }))));
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("heading", { name: "Tesserati per squadra" })).toBeVisible();
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, "/altro/statistiche", ["statistics:read"], handler());
    await expect(page.getByRole("heading", { name: "Ultimi risultati" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("bacheca", () => {
  const MANAGER = ["announcements:read", "announcements:write", "teams:read"];

  /** Backend with a mutable board: a created announcement shows up in the next list, like the real API. */
  function boardBackend(initial: Announcement[], listAnswer?: () => ApiAnswer) {
    const state = { items: initial };
    const handler: ApiHandler = ({ method, path, body }) => {
      switch (`${method} ${path}`) {
        case "GET /teams":
          return pageOf(TEAMS);
        case "GET /announcements":
          return listAnswer ? listAnswer() : pageOf(state.items);
        case "POST /announcements": {
          const sent = body as { title: string; body: string };
          const created = announcement({ id: "a-new", title: sent.title, body: sent.body });
          state.items = [created, ...state.items];
          return { status: 201, body: created };
        }
        default:
          return undefined;
      }
    };
    return handler;
  }

  test("a manager publishes an announcement and it appears on the board", async ({ page }) => {
    const api = await open(page, "/altro/bacheca", MANAGER, boardBackend([PINNED, TEAM_NOTICE, DRAFT]));

    await expect(page.getByRole("heading", { level: 1, name: /Le comunicazioni, in un posto solo/ })).toBeVisible();
    await expect(page.getByRole("article", { name: "Palestra chiusa sabato" })).toContainText("In evidenza");
    await expect(page.getByRole("article", { name: "Cena sociale di dicembre" })).toContainText("Bozza");
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Nuova comunicazione" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nuova comunicazione" });
    await expect(dialog).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByRole("button", { name: "Salva la comunicazione" }).click();
    await expect(dialog.getByText("Scrivi il titolo")).toBeVisible();

    await dialog.getByLabel(/^Titolo/).fill("Allenamento spostato");
    await dialog.getByLabel(/^Testo/).fill("Giovedì ci si allena alle 18:30.");
    await dialog.getByRole("button", { name: "Salva la comunicazione" }).click();

    await expect(page.getByText("Comunicazione salvata")).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(api.bodies.get("POST /announcements")).toEqual({
      title: "Allenamento spostato",
      body: "Giovedì ci si allena alle 18:30.",
      isPinned: false,
    });
    await expect(page.getByRole("article", { name: "Allenamento spostato" })).toBeVisible();
  });

  test("a reader sees the announcements but no write actions", async ({ page }) => {
    await open(page, "/altro/bacheca", ["announcements:read", "teams:read"], boardBackend([PINNED, TEAM_NOTICE]));
    await expect(page.getByRole("article", { name: "Convocazione U16 per il torneo" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nuova comunicazione|Modifica|Elimina|Fissa/ })).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a failed load shows an error and retrying recovers", async ({ page }) => {
    await open(page, "/altro/bacheca", MANAGER, boardBackend([], failing(3, () => pageOf([PINNED]))));
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("article", { name: "Palestra chiusa sabato" })).toBeVisible();
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, "/altro/bacheca", MANAGER, boardBackend([PINNED, TEAM_NOTICE, DRAFT]));
    await expect(page.getByRole("article", { name: "Palestra chiusa sabato" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Nuova comunicazione" }).first().click();
    await expect(page.getByRole("dialog", { name: "Nuova comunicazione" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("tornei", () => {
  const READER = ["competitions:read"];
  const COACH = ["competitions:read", "competitions:write"];

  const handler = (standingsA: () => ApiAnswer = () => ({ body: STANDINGS_A })): ApiHandler => ({ method, path, query }) => {
    switch (`${method} ${path}`) {
      case "GET /seasons":
        return pageOf([SEASON]);
      case "GET /competitions":
        // Only a request filtered by kind gets the tournament: the page must not list the leagues
        return pageOf(query.get("kind") === "TOURNAMENT" ? [TOURNAMENT] : []);
      case "GET /competitions/c-natale/groups":
        return pageOf([POOL_A, POOL_B]);
      case "GET /competitions/c-natale/groups/g-a/standings":
        return standingsA();
      case "GET /competitions/c-natale/groups/g-b/standings":
        return { body: STANDINGS_B };
      case "GET /competitions/c-natale/groups/g-a/matches":
      case "GET /competitions/c-natale/groups/g-a/teams":
        return pageOf([]);
      default:
        return undefined;
    }
  };

  test("shows one standings table per pool", async ({ page }) => {
    await open(page, "/altro/tornei", READER, handler());

    await expect(page.getByRole("heading", { level: 1, name: /Ogni girone ha la sua classifica/ })).toBeVisible();
    await expect(page.getByRole("table", { name: "Classifica Girone A" })).toContainText("Aquile Volley");
    await expect(page.getByRole("table", { name: "Classifica Girone B" })).toContainText("Tigri Volley");
    await expect(page.getByRole("tab", { name: "Gestione" })).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("tab", { name: "Partite" }).click();
    await expect(page.getByText("Nessuna partita in questo girone")).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a coach manages the tournaments from the Gestione tab", async ({ page }) => {
    await open(page, "/altro/tornei", COACH, handler());
    await page.getByRole("tab", { name: "Gestione" }).click();
    await expect(page.getByRole("list", { name: "Tornei" })).toContainText("Torneo di Natale");
    await page.getByRole("button", { name: "Nuovo torneo" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuovo torneo" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Tipo")).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a failed load shows an error and retrying recovers", async ({ page }) => {
    await open(page, "/altro/tornei", READER, handler(failing(3, () => ({ body: STANDINGS_A }))));
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("table", { name: "Classifica Girone A" })).toBeVisible();
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, "/altro/tornei", READER, handler());
    await expect(page.getByRole("table", { name: "Classifica Girone B" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("arbitri", () => {
  const MANAGER = ["referees:read", "referees:write", "competitions:read"];

  /** Backend with a mutable designation: marking the fee as reimbursed changes the next list. */
  function refereesBackend(listAnswer?: () => ApiAnswer) {
    const state = { items: [TO_REIMBURSE, REIMBURSED, NO_FEE] };
    const handler: ApiHandler = ({ method, path, body }) => {
      switch (`${method} ${path}`) {
        case "GET /referees":
          return pageOf([VERDI, BIANCHI]);
        case "GET /referee-assignments":
          return listAnswer ? listAnswer() : pageOf(state.items);
        case "PATCH /referee-assignments/as-open": {
          const { reimbursedAt } = body as { reimbursedAt: string | null };
          const updated = { ...TO_REIMBURSE, reimbursedAt };
          state.items = state.items.map((item) => (item.id === updated.id ? updated : item));
          return { body: updated };
        }
        default:
          return undefined;
      }
    };
    return handler;
  }

  test("a manager marks a fee as reimbursed", async ({ page }) => {
    const api = await open(page, "/altro/arbitri", MANAGER, refereesBackend());

    await expect(page.getByRole("heading", { level: 1, name: /Designazioni e rimborsi/ })).toBeVisible();
    const list = page.getByRole("list", { name: "Designazioni" });
    await expect(list.getByRole("listitem").first()).toContainText("Da rimborsare");
    await expect(list.getByRole("listitem").nth(1)).toContainText("Rimborsato il");
    expect(await auditAccessibility(page)).toEqual([]);

    await list.getByRole("listitem").first().getByRole("button", { name: "Segna come rimborsato" }).click();
    await expect(page.getByText("Rimborso registrato")).toBeVisible();
    await expect(list.getByRole("listitem").first()).toContainText("Rimborsato il");
    expect(api.bodies.get("PATCH /referee-assignments/as-open")).toEqual({ reimbursedAt: expect.any(String) });
  });

  test("the referees tab lists the roster and opens the form", async ({ page }) => {
    await open(page, "/altro/arbitri", MANAGER, refereesBackend());
    await page.getByRole("tab", { name: "Arbitri" }).click();
    await expect(page.getByRole("list", { name: "Arbitri" })).toContainText("Marco Verdi");
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Nuovo arbitro" }).click();
    await expect(page.getByRole("dialog", { name: "Nuovo arbitro" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a reader sees the designations without write actions", async ({ page }) => {
    await open(page, "/altro/arbitri", ["referees:read", "competitions:read"], refereesBackend());
    await expect(page.getByRole("list", { name: "Designazioni" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nuova designazione|Segna come rimborsato|Modifica|Elimina/ })).toHaveCount(0);
  });

  test("a failed load shows an error and retrying recovers", async ({ page }) => {
    await open(page, "/altro/arbitri", MANAGER, refereesBackend(failing(3, () => pageOf([TO_REIMBURSE]))));
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("list", { name: "Designazioni" })).toBeVisible();
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, "/altro/arbitri", MANAGER, refereesBackend());
    await expect(page.getByRole("list", { name: "Designazioni" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await page.getByRole("tab", { name: "Arbitri" }).click();
    await expect(page.getByRole("list", { name: "Arbitri" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});
