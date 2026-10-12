import { expect, test, type Page } from "@playwright/test";
import {
  COMPETITION,
  GROUP,
  GROUP_TEAMS,
  SEASON,
  STANDINGS_AFTER,
  STANDINGS_BEFORE,
  match,
} from "../src/features/classifiche/test-fixtures";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiHandler } from "./support/route-api";

const COACH = ["competitions:read", "competitions:write", "evaluations:read", "evaluations:write"];
const READER = ["competitions:read", "evaluations:readOwn"];

const SCHEDULED = match({ id: "m1", round: 5 });
const PLAYED = { ...SCHEDULED, status: "PLAYED" as const, homeSets: 3, awaySets: 1 };

/** Backend of the module: the standings change as soon as the result of the Aquile-Delfini match is stored. */
function competitionsBackend() {
  const state = { resultSaved: false, standingsFailures: 0 };
  const handler: ApiHandler = ({ method, path }) => {
    switch (`${method} ${path}`) {
      case "GET /seasons":
        return pageOf([SEASON]);
      case "GET /competitions":
        return pageOf([COMPETITION]);
      case "GET /competitions/c1/groups":
        return pageOf([GROUP]);
      case "GET /competitions/c1/groups/g1/teams":
        return pageOf(GROUP_TEAMS);
      case "GET /competitions/c1/groups/g1/standings":
        if (state.standingsFailures > 0) {
          state.standingsFailures -= 1;
          return { status: 500, body: { type: "about:blank", title: "Error", status: 500, code: "internal" } };
        }
        return { body: state.resultSaved ? STANDINGS_AFTER : STANDINGS_BEFORE };
      case "GET /competitions/c1/groups/g1/matches":
        return pageOf([state.resultSaved ? PLAYED : SCHEDULED]);
      case "PUT /matches/m1/result":
        state.resultSaved = true;
        return { body: PLAYED };
      default:
        return undefined;
    }
  };
  return { state, handler };
}

async function openAs(page: Page, permissions: string[], backend = competitionsBackend()) {
  await mockApi(page);
  const api = await routeApi(page, { permissions }, backend.handler);
  await seedStoredSession(page);
  await page.goto("/classifiche");
  return { api, backend };
}

const bodyRows = (page: Page) => page.getByRole("row").filter({ hasNot: page.getByRole("columnheader") });

test.describe("classifiche", () => {
  test("a coach enters a result and the standings reorder by themselves", async ({ page }) => {
    const { api } = await openAs(page, COACH);

    await expect(page.getByRole("heading", { level: 1, name: /Classifiche che si aggiornano/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Classifica Girone B" })).toBeVisible();
    await expect(page.getByText("Classifica aggiornata in automatico")).toBeVisible();
    await expect(bodyRows(page).first()).toContainText("Falchi Volley");
    await expect(bodyRows(page).nth(2)).toContainText("Aquile Volley");
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("tab", { name: "Partite" }).click();
    await page.getByRole("button", { name: "Inserisci risultato" }).click();
    const dialog = page.getByRole("dialog", { name: "Inserisci il risultato" });
    await expect(dialog).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByLabel(/Set vinti da Aquile Volley/).fill("3");
    await dialog.getByLabel(/Set vinti da Delfini Volley/).fill("3");
    await dialog.getByRole("button", { name: "Salva risultato" }).click();
    await expect(dialog.getByText("Una squadra deve vincere 3 set e l'altra meno di 3")).toBeVisible();

    await dialog.getByLabel(/Set vinti da Delfini Volley/).fill("1");
    await dialog.getByRole("button", { name: "Salva risultato" }).click();
    await expect(page.getByText("Risultato salvato")).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(api.calls).toContain("PUT /matches/m1/result");
    expect(api.bodies.get("PUT /matches/m1/result")).toMatchObject({ homeSets: 3, awaySets: 1 });
    await expect(page.getByRole("list", { name: "Giornata 5" })).toContainText("3-1");

    await page.getByRole("tab", { name: "Classifica" }).click();
    await expect(bodyRows(page).first()).toContainText("Aquile Volley");
    await expect(bodyRows(page).first()).toContainText("32");
    await expect(bodyRows(page).first().getByText("Sale di 2 posizioni")).toBeAttached();
    await expect(bodyRows(page).nth(1)).toContainText("Falchi Volley");
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a reader sees standings and matches but no write actions", async ({ page }) => {
    await openAs(page, READER);
    await expect(page.getByRole("heading", { name: "Classifica Girone B" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Gestione" })).toHaveCount(0);

    await page.getByRole("tab", { name: "Partite" }).click();
    await expect(page.getByRole("list", { name: "Giornata 5" })).toBeVisible();
    await expect(page.getByRole("button", { name: /risultato|Aggiungi partita/ })).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a failed load shows an error and retrying recovers", async ({ page }) => {
    const backend = competitionsBackend();
    backend.state.standingsFailures = 1;
    await openAs(page, READER, backend);
    await expect(page.getByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("heading", { name: "Classifica Girone B" })).toBeVisible();
  });

  test("the management tab lists seasons, championships, groups and teams", async ({ page }) => {
    await openAs(page, COACH);
    await page.getByRole("tab", { name: "Gestione" }).click();
    await expect(page.getByRole("list", { name: "Stagioni" })).toContainText("2026/27");
    await expect(page.getByRole("list", { name: "Campionati e tornei" })).toContainText("Serie D femminile");
    await expect(page.getByRole("list", { name: "Gironi" })).toContainText("Girone B");
    await expect(page.getByRole("list", { name: "Squadre di Girone B" })).toContainText("Delfini Volley");
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openAs(page, COACH);
    await expect(page.getByRole("heading", { name: "Classifica Girone B" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole("tab", { name: "Partite" }).click();
    await expect(page.getByRole("list", { name: "Giornata 5" })).toBeVisible();
    const matchesOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(matchesOverflow).toBeLessThanOrEqual(0);
  });
});
