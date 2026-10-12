import { expect, test, type Page } from "@playwright/test";
import { COMPETITION, GROUP, SEASON, match } from "../src/features/classifiche/test-fixtures";
import {
  GIULIA,
  HISTORY_GIULIA,
  MARTA,
  SQUAD,
  SUMMARY_GIULIA,
  evaluation,
  reportCards,
} from "../src/features/pagelle/test-fixtures";
import type { ReportCardEntry } from "../src/features/pagelle/types";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiHandler } from "./support/route-api";

const COACH = ["competitions:read", "evaluations:read", "evaluations:write"];
const PLAYED = match({ id: "m1", status: "PLAYED", homeSets: 3, awaySets: 1, round: 5 });

/** Backend of the module: ratings and publication change the cards, like the real API. */
function pagelleBackend(initial: ReportCardEntry[]) {
  const state = { cards: initial };
  const handler: ApiHandler = ({ method, path, body }) => {
    switch (`${method} ${path}`) {
      case "GET /seasons":
        return pageOf([SEASON]);
      case "GET /competitions":
        return pageOf([COMPETITION]);
      case "GET /competitions/c1/groups":
        return pageOf([GROUP]);
      case "GET /competitions/c1/groups/g1/matches":
        return pageOf([PLAYED]);
      case "GET /matches/m1":
        return { body: PLAYED };
      case "GET /matches/m1/report-cards":
        return { body: reportCards(state.cards) };
      case "PUT /matches/m1/evaluations/mb-marta": {
        const rating = (body as { rating: number }).rating;
        state.cards = state.cards.map((entry) =>
          entry.member.id === MARTA.id
            ? { ...entry, evaluation: evaluation(MARTA, { rating, published: false, publishedAt: null }) }
            : entry,
        );
        return { body: evaluation(MARTA, { rating, published: false, publishedAt: null }) };
      }
      case "POST /matches/m1/evaluations/publish": {
        const drafts = state.cards.flatMap((entry) => (entry.evaluation && !entry.evaluation.published ? [entry.evaluation] : []));
        state.cards = state.cards.map((entry) =>
          entry.evaluation ? { ...entry, evaluation: { ...entry.evaluation, published: true, publishedAt: "2026-11-15T10:00:00.000Z" } } : entry,
        );
        return { body: { publishedCount: drafts.length, evaluations: drafts } };
      }
      case "GET /members/mb-giulia/evaluation-summary":
        return { body: SUMMARY_GIULIA };
      case "GET /members/mb-giulia/evaluations":
        return pageOf(HISTORY_GIULIA);
      default:
        return undefined;
    }
  };
  return { state, handler };
}

async function openAs(
  page: Page,
  url: string,
  me: Parameters<typeof routeApi>[1],
  backend = pagelleBackend(SQUAD),
) {
  await mockApi(page);
  const api = await routeApi(page, me, backend.handler);
  await seedStoredSession(page);
  await page.goto(url);
  return { api, backend };
}

test.describe("pagelle", () => {
  test("the coach rates a player and publishes the report cards", async ({ page }) => {
    const { api } = await openAs(page, "/pagelle", { permissions: COACH });

    await expect(page.getByRole("heading", { level: 1, name: /Ogni partita, ogni giocatrice/ })).toBeVisible();
    await page.getByRole("link", { name: /Aquile Volley 3-1 Delfini Volley/ }).click();

    await expect(page).toHaveURL(/\/pagelle\/partita\/m1$/);
    await expect(page.getByRole("heading", { level: 1, name: /Aquile Volley 3-1 Delfini Volley/ })).toBeVisible();
    const giulia = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Giulia Rossi" }) });
    await expect(giulia.getByText("MVP")).toBeVisible();
    await expect(giulia.getByRole("img", { name: "Voto di Giulia Rossi: 8,5 su 10" })).toBeVisible();
    await expect(giulia.getByRole("progressbar", { name: "Attacchi vincenti" })).toHaveAttribute("aria-valuenow", "18");
    await expect(page.getByText("Una pagella è in bozza")).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Assegna voto a Marta Bianchi" }).click();
    const dialog = page.getByRole("dialog", { name: "Assegna il voto" });
    await expect(dialog).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
    await dialog.getByLabel(/^Voto/).fill("11");
    await dialog.getByRole("button", { name: "Salva pagella" }).click();
    await expect(dialog.getByText(/Inserisci un voto da 1 a 10/)).toBeVisible();
    await dialog.getByLabel(/^Voto/).fill("8,5");
    await dialog.getByLabel("Note dell'allenatore").fill("Alzata precisa nel quarto set.");
    await dialog.getByRole("button", { name: "Salva pagella" }).click();
    await expect(page.getByText("Pagella salvata")).toBeVisible();
    expect(api.bodies.get("PUT /matches/m1/evaluations/mb-marta")).toEqual({ rating: 8.5, notes: "Alzata precisa nel quarto set." });

    const marta = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Marta Bianchi" }) });
    await expect(marta.getByRole("img", { name: "Voto di Marta Bianchi: 8,5 su 10" })).toBeVisible();
    await expect(page.getByText("2 pagelle sono in bozza")).toBeVisible();

    await page.getByRole("button", { name: "Pubblica 2 pagelle" }).click();
    await page.getByRole("dialog", { name: "Pubblicare 2 pagelle?" }).getByRole("button", { name: "Pubblica" }).click();
    await expect(page.getByText("2 pagelle pubblicate")).toBeVisible();
    await expect(page.getByText("sono in bozza")).toHaveCount(0);
    await expect(marta.getByText("Pubblicata")).toBeVisible();
  });

  test("an athlete sees only her own published report cards, read only", async ({ page }) => {
    const own = SQUAD.filter((entry) => entry.member.id === GIULIA.id);
    await openAs(
      page,
      "/pagelle",
      { permissions: ["competitions:read", "evaluations:readOwn"], roles: ["ATLETA"], member: { id: GIULIA.id, firstName: "Giulia", lastName: "Rossi" } },
      pagelleBackend(own),
    );

    await expect(page.getByRole("heading", { level: 2, name: "Giulia Rossi" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Media voto di Giulia Rossi: 8,2 su 10" })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Pagelle partita per partita" })).toContainText("Aquile Volley 3–1 Delfini Volley");
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("link", { name: /Aquile Volley 3–1 Delfini Volley/ }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Giulia Rossi" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Assegna voto|Modifica pagella|Pubblica/ })).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openAs(page, "/pagelle/partita/m1", { permissions: COACH });
    await expect(page.getByRole("heading", { level: 3, name: "Giulia Rossi" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
