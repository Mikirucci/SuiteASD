import { expect, test, type Page } from "@playwright/test";
import { GIULIA, at } from "../src/features/calendario/test-fixtures";
import { auditAccessibility } from "./support/axe";
import { ATHLETE, COACH, FROZEN_NOW, calendarBackend, routeIcalExport, type CalendarBackendOptions } from "./support/calendario-fixtures";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { routeApi, type MeOptions } from "./support/route-api";

const GUARDIAN: MeOptions = {
  permissions: ATHLETE,
  roles: ["GENITORE"],
  member: { id: GIULIA.id, firstName: "Giulia", lastName: "Rossi" },
};

/** Lets enter animations (dialogs, tab content) finish so the colour contrast check reads the final colours. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

/** Opens a page of the module with the browser clock on Thursday 12 November 2026, the day of the demo data. */
async function openAs(page: Page, url: string, me: MeOptions, options: CalendarBackendOptions = {}) {
  const backend = calendarBackend(options);
  await page.clock.setFixedTime(FROZEN_NOW);
  await mockApi(page);
  const api = await routeApi(page, me, backend.handler);
  await routeIcalExport(page);
  await seedStoredSession(page);
  await page.goto(url);
  return { api, backend };
}

const coach: MeOptions = { permissions: COACH };
const dayStrip = (page: Page) => page.getByRole("group", { name: "Giorni della settimana" });
const dayEvents = (page: Page) => page.getByRole("list", { name: "Eventi del giorno" });

async function openMatch(page: Page) {
  await dayStrip(page).getByRole("button", { name: /sab 14 novembre/ }).click();
  await dayEvents(page).getByRole("button", { name: "Aquile Volley vs Delfini Volley" }).click();
  return page.getByRole("dialog", { name: "Aquile Volley vs Delfini Volley" });
}

test.describe("calendario, allenatore", () => {
  test("shows the week strip, the events of the day and the match card, without accessibility violations", async ({ page }) => {
    await openAs(page, "/calendario", coach);

    await expect(page.getByRole("heading", { level: 1, name: /Partite e convocazioni, già organizzate/ })).toBeVisible();
    await expect(dayStrip(page).getByRole("button", { name: /gio 12 novembre, con eventi/ })).toHaveAttribute("aria-pressed", "true");
    await expect(dayStrip(page).getByRole("button", { name: /ven 13 novembre, nessun evento/ })).toBeVisible();
    await expect(dayEvents(page).getByRole("heading", { level: 3, name: "Allenamento" })).toBeVisible();
    await expect(dayEvents(page)).toContainText("Palestra comunale");

    await dayStrip(page).getByRole("button", { name: /sab 14 novembre, con eventi/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: /Sabato 14 novembre/ })).toBeVisible();
    await expect(dayEvents(page).getByText("Serie D · Girone B · Giornata 6")).toBeVisible();
    await expect(dayEvents(page).getByRole("heading", { level: 3, name: "Aquile Volley vs Delfini Volley" })).toBeVisible();
    await expect(dayEvents(page)).toContainText("Sabato 14 novembre · 20:30–22:30 · Palazzetto");
    await expect(dayEvents(page).getByText("5/12 confermate")).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await dayStrip(page).getByRole("button", { name: /ven 13 novembre/ }).click();
    await expect(page.getByRole("heading", { name: "Nessun evento in questo giorno" })).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("moves to the next week and back", async ({ page }) => {
    await openAs(page, "/calendario", coach);
    await expect(page.getByText("9 – 15 novembre 2026")).toBeVisible();
    await page.getByRole("button", { name: "Settimana successiva" }).click();
    await expect(page.getByText("16 – 22 novembre 2026")).toBeVisible();
    await expect(dayStrip(page).getByRole("button", { name: /nessun evento/ })).toHaveCount(7);
    await page.getByRole("button", { name: "Torna a oggi" }).click();
    await expect(dayEvents(page).getByRole("heading", { level: 3, name: "Allenamento" })).toBeVisible();
  });

  test("shows the squad of a match with the answers and sends a reminder to who has not answered", async ({ page }) => {
    const { api } = await openAs(page, "/calendario", coach);
    const dialog = await openMatch(page);

    await expect(dialog.getByText("5/12 confermate")).toBeVisible();
    await expect(dialog.getByRole("progressbar", { name: /Presenze confermate/ })).toHaveAttribute("aria-valuenow", "5");
    await expect(dialog.getByRole("list", { name: "Confermati" }).getByRole("listitem").filter({ hasText: "Giulia Rossi" })).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Senza risposta" }).getByRole("listitem").filter({ hasText: "Anna Ferri" })).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Rifiutati" }).getByRole("listitem").filter({ hasText: "Chiara Neri" })).toContainText("Esame all'università");
    await expect(dialog.getByText(/^Avviso inviato il /)).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByRole("button", { name: "Sollecita chi non ha risposto" }).click();
    await expect(page.getByText("2 promemoria inviati")).toBeVisible();
    expect(api.calls).toContain("POST /events/ev-match/convocations/remind");
  });

  test("creates a weekly series of trainings", async ({ page }) => {
    const { api } = await openAs(page, "/calendario", coach);
    await page.getByRole("button", { name: "Nuovo evento" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nuovo evento" });

    await dialog.getByRole("button", { name: "Crea l'evento" }).click();
    await expect(dialog.getByText("Inserisci il titolo dell'evento")).toBeVisible();
    await expect(dialog.getByText("Inserisci l'ora di inizio")).toBeVisible();

    await dialog.getByLabel(/^Titolo/).fill("Allenamento del giovedì");
    await dialog.getByLabel(/^Inizio/).fill("19:00");
    await dialog.getByLabel("Fine", { exact: true }).fill("20:30");
    await dialog.getByLabel("Squadra", { exact: true }).selectOption("t-sd");
    await dialog.getByRole("switch", { name: "Ripeti ogni settimana" }).click();
    await dialog.getByLabel("Numero di allenamenti").fill("10");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByRole("button", { name: "Crea l'evento" }).click();
    await expect(page.getByText("10 allenamenti creati")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(api.bodies.get("POST /events")).toEqual({
      type: "TRAINING",
      title: "Allenamento del giovedì",
      startsAt: at(11, 12, 19, 0),
      endsAt: at(11, 12, 20, 30),
      teamId: "t-sd",
      recurrence: { frequency: "WEEKLY", interval: 1, count: 10 },
    });
    await expect(dayEvents(page).getByRole("heading", { level: 3, name: "Allenamento del giovedì" })).toBeVisible();
  });

  test("moves a training and athletes are told", async ({ page }) => {
    const { api } = await openAs(page, "/calendario", coach);
    await dayEvents(page).getByRole("button", { name: "Allenamento", exact: true }).click();
    await page.getByRole("dialog", { name: "Allenamento" }).getByRole("button", { name: "Sposta" }).click();

    const dialog = page.getByRole("dialog", { name: "Sposta l'evento" });
    await dialog.getByLabel("Nuova data").fill("2026-11-19");
    await dialog.getByLabel("Nuova ora di inizio").fill("19:30");
    await dialog.getByLabel("Luogo").selectOption("v-palazzetto");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Sposta l'evento" }).click();

    await expect(page.getByText("Evento spostato")).toBeVisible();
    expect(api.bodies.get("PATCH /events/ev-training")).toEqual({
      startsAt: at(11, 19, 19, 30),
      endsAt: at(11, 19, 21, 0),
      venueId: "v-palazzetto",
    });
    await expect(page.getByText("16 – 22 novembre 2026")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Allenamento" }).getByText("Spostato")).toBeVisible();
  });

  test("cancels an event with a reason", async ({ page }) => {
    const { api } = await openAs(page, "/calendario", coach);
    await dayEvents(page).getByRole("button", { name: "Allenamento", exact: true }).click();
    await page.getByRole("dialog", { name: "Allenamento" }).getByRole("button", { name: "Annulla evento" }).click();

    const dialog = page.getByRole("dialog", { name: "Annullare l'evento?" });
    await dialog.getByLabel(/Motivo/).fill("Palestra chiusa per allerta meteo");
    await dialog.getByRole("button", { name: "Annulla l'evento" }).click();

    await expect(page.getByText("Evento annullato", { exact: true }).first()).toBeVisible();
    expect(api.bodies.get("POST /events/ev-training/cancel")).toEqual({ reason: "Palestra chiusa per allerta meteo" });
    await expect(page.getByRole("dialog", { name: "Allenamento" })).toContainText("atleti e genitori sono stati avvisati");
  });

  test("downloads the calendar as an iCal file", async ({ page }) => {
    await openAs(page, "/calendario", coach);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Esporta in iCal" }).click();
    expect((await download).suggestedFilename()).toBe("calendario.ics");
    await expect(page.getByText("Calendario esportato")).toBeVisible();
  });

  test("a failed load shows an error and retrying recovers", async ({ page }) => {
    // First attempt plus the two automatic retries of React Query
    await openAs(page, "/calendario", coach, { eventsFailures: 3 });
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(dayEvents(page).getByRole("heading", { level: 3, name: "Allenamento" })).toBeVisible();
  });
});

test.describe("calendario, genitore", () => {
  test("answers the convocation of the daughter from the page, without staff tools", async ({ page }) => {
    const { api } = await openAs(page, "/area-personale/calendario", GUARDIAN, { viewer: "athlete" });

    const section = page.getByRole("region", { name: "Da confermare" });
    await expect(section).toContainText("Giulia Rossi");
    await expect(section).toContainText("Aquile Volley vs Delfini Volley");
    await expect(page.getByRole("button", { name: "Nuovo evento" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Presenze allenamenti" })).toHaveCount(0);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await section.getByRole("button", { name: /Non ci sono: Giulia Rossi/ }).click();
    await section.getByLabel("Motivo (facoltativo)").fill("Ha l'esame di maturità");
    await section.getByRole("button", { name: "Conferma che non ci sono" }).click();

    await expect(page.getByText("Risposta registrata")).toBeVisible();
    expect(api.bodies.get("PUT /convocations/cv-m-giulia/response")).toEqual({ status: "DECLINED", reason: "Ha l'esame di maturità" });
    await expect(section.getByText(/Nessuna convocazione da confermare/)).toBeVisible();
  });

  test("confirms with one tap", async ({ page }) => {
    const { api } = await openAs(page, "/area-personale/calendario", GUARDIAN, { viewer: "athlete" });
    await page.getByRole("button", { name: "Confermo la presenza di Giulia Rossi" }).click();
    await expect(page.getByText("Presenza confermata", { exact: true })).toBeVisible();
    expect(api.bodies.get("PUT /convocations/cv-m-giulia/response")).toEqual({ status: "CONFIRMED" });
  });
});

test.describe("presenze agli allenamenti", () => {
  test("the coach marks who is at training and reads history and percentages", async ({ page }) => {
    const { api } = await openAs(page, "/calendario/presenze", coach);

    await expect(page.getByRole("heading", { level: 1, name: /Chi c'è, a colpo d'occhio/ })).toBeVisible();
    await expect(page.getByLabel("Allenamento", { exact: true })).toHaveValue("ev-past");
    await expect(page.getByText("1 presente · 0 assenti · 2 da segnare")).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    const rows = page.getByRole("list", { name: "Atleti dell'allenamento" }).getByRole("listitem");
    await rows.filter({ hasText: "Giulia Rossi" }).getByRole("button", { name: "Presente" }).click();
    await rows.filter({ hasText: "Sara Conti" }).getByRole("button", { name: "Assente" }).click();
    await expect(page.getByText("2 presenti · 1 assente · 0 da segnare")).toBeVisible();
    await page.getByRole("button", { name: "Salva presenze" }).click();
    await expect(page.getByText("Presenze salvate")).toBeVisible();
    expect(api.bodies.get("PUT /events/ev-past/attendance")).toEqual({
      entries: [
        { memberId: "m-anna", present: true },
        { memberId: "m-giulia", present: true },
        { memberId: "m-sara", present: false },
      ],
    });

    await page.getByRole("tab", { name: "Storico e percentuali" }).click();
    await expect(page.getByText("87,5%")).toBeVisible();
    await expect(page.getByRole("list", { name: "Presenze per atleta" }).getByRole("listitem").filter({ hasText: "Sara Conti" })).toContainText("62,5%");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: /Sara Conti/ }).click();
    const history = page.getByRole("dialog", { name: "Sara Conti" });
    await expect(history.getByRole("list", { name: "Storico degli allenamenti" })).toContainText("Presente");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});

test.describe("calendario su telefono", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  const horizontalOverflow = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  test("fits a 320px screen without horizontal scrolling, with 44px targets", async ({ page }) => {
    await openAs(page, "/calendario", coach);
    await expect(dayEvents(page).getByRole("heading", { level: 3, name: "Allenamento" })).toBeVisible();
    await settle(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    const days = await dayStrip(page).getByRole("button").all();
    expect(days).toHaveLength(7);
    for (const day of days) {
      const box = await day.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    // The row scrolls inside itself: the page does not
    const stripBox = await dayStrip(page).boundingBox();
    expect((stripBox?.x ?? -1) + (stripBox?.width ?? 0)).toBeLessThanOrEqual(320);
    const create = await page.getByRole("button", { name: "Nuovo evento" }).first().boundingBox();
    expect(create?.height ?? 0).toBeGreaterThanOrEqual(44);

    const dialog = await openMatch(page);
    await expect(dialog.getByText("5/12 confermate")).toBeVisible();
    await settle(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const box = await dialog.boundingBox();
    expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("the attendance page fits a 320px screen", async ({ page }) => {
    await openAs(page, "/calendario/presenze", coach);
    await expect(page.getByText("1 presente · 0 assenti · 2 da segnare")).toBeVisible();
    await settle(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);
    const toggle = await page.getByRole("button", { name: "Presente" }).first().boundingBox();
    expect(toggle?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
