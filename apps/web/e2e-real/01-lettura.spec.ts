import { expect, test } from "@playwright/test";
import { createDemoSociety, dateLabel, dayLabel, type DemoSociety } from "./support/demo-society";
import { loginAs } from "./support/session";

// Read-only tour of a society built through the API (see support/demo-society.ts): the numbers asserted here are the ones it creates.
test.describe("società demo, in sola lettura", () => {
  let society: DemoSociety;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    society = await createDemoSociety();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, society.people.admin);
  });

  test("la home saluta e porta a tutti i moduli", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ciao");
    const sidebar = page.getByRole("navigation", { name: "Sezioni", exact: true });
    await expect(sidebar.getByRole("link", { name: "Home" })).toBeVisible();
    const topics = {
      Persone: ["Tesserati", "Squadre", "Staff", "Accessi e inviti"],
      "Attività sportiva": ["Calendario", "Presenze", "Classifiche", "Tornei", "Pagelle", "Arbitri", "Statistiche"],
      Amministrazione: ["Pagamenti", "Scadenze e documenti", "Bilancio", "Sponsor"],
      Logistica: ["Palestre", "Trasferte", "Divise"],
      Comunicazione: ["Notifiche", "Bacheca", "Automazioni"],
    };
    for (const [topic, labels] of Object.entries(topics)) {
      const group = sidebar.getByRole("button", { name: topic });
      if ((await group.getAttribute("aria-expanded")) === "false") await group.click();
      for (const label of labels) {
        await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
      }
    }
    await expect(sidebar.getByRole("link", { name: "Altro" })).toHaveCount(0);
  });

  test("tesserati: ricerca di Sara Conti e scheda con il certificato in scadenza", async ({ page }) => {
    await page.goto("/tesserati");
    await page.getByRole("searchbox", { name: "Cerca tesserato" }).fill(society.sara.fullName);
    const list = page.getByRole("list", { name: "Tesserati" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await list.getByRole("link", { name: new RegExp(society.sara.fullName) }).click();
    await expect(page.getByRole("heading", { level: 1, name: society.sara.fullName })).toBeVisible();
    await expect(page.getByRole("list", { name: "Documenti del tesserato" })).toContainText("Certificato medico");
  });

  test("scadenze: il certificato di Sara Conti scade tra 15 giorni", async ({ page }) => {
    await page.goto("/scadenze");
    await page.getByRole("link", { name: "Certificato medico" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Certificato medico" })).toBeVisible();
    const people = page.getByRole("list", { name: "Persone del documento" }).getByRole("listitem");
    await expect(people.filter({ hasText: society.sara.fullName })).toContainText(`Scade il ${dateLabel(society.sara.certificateDays)}`);
    // everybody else has not handed it in yet
    await expect(people.filter({ hasText: "Alice Moretti" })).toContainText("Non ancora consegnato");
  });

  test("classifiche: Girone B di Serie D con Aquile Volley prima", async ({ page }) => {
    await page.goto("/classifiche");
    const { order } = society.standings;
    const rows = page.getByRole("row").filter({ hasNot: page.getByRole("columnheader") });
    await expect(rows).toHaveCount(order.length);
    for (const [index, team] of order.entries()) {
      await expect(rows.nth(index)).toContainText(team.name);
    }
    await expect(rows.nth(0)).toContainText(String(order[0]?.points));
  });

  test("quote: incassati i soldi delle quote pagate, il resto da incassare, piano per piano", async ({ page }) => {
    await page.goto("/quote");
    const { paid, pending, amountEuro, overdue, overdueEuro, overduePlan, name } = society.feePlan;
    const report = page.getByRole("region", { name: "Rendiconto" });
    await expect(report.getByText("Incassato", { exact: true }).locator("../..")).toContainText(new RegExp(`€\\s${paid * amountEuro}`));
    await expect(report.getByText("Da incassare", { exact: true }).locator("../..")).toContainText(new RegExp(`€\\s${pending * amountEuro + overdue * overdueEuro}`));

    const plans = page.getByRole("list", { name: "Piani", exact: true }).getByRole("listitem");
    await expect(plans).toHaveCount(2);
    const november = plans.filter({ hasText: name });
    await expect(november.getByText("persone in regola").locator("xpath=preceding-sibling::span[1]")).toHaveText(String(paid));
    await expect(november.getByText("persone in attesa").locator("xpath=preceding-sibling::span[1]")).toHaveText(String(pending));
    const late = plans.filter({ hasText: overduePlan });
    await expect(late.getByText("persone con quote scadute").locator("xpath=preceding-sibling::span[1]")).toHaveText(String(overdue));
  });

  test("calendario: la prossima partita con le presenze confermate", async ({ page }) => {
    const { match, standings } = society;
    await page.goto("/calendario");
    // The week strip starts from the current week: walk forward to the week of the match.
    const next = page.getByRole("button", { name: "Settimana successiva" });
    const day = page.getByRole("button", { name: new RegExp(dayLabel(match.daysAhead)) });
    for (let week = 0; week < 8 && !(await day.isVisible()); week += 1) await next.click();
    await day.click();
    await expect(page.getByText(match.title).first()).toBeVisible();
    await expect(page.getByText(`${standings.competition} · ${standings.group} · GIORNATA ${match.round}`.toUpperCase())).toBeVisible();
    await expect(page.getByText(match.time).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`${match.confirmed}/${match.slots}\\s+confermate`))).toBeVisible();
  });

  test("automazioni: tutte le attività attive, 100%", async ({ page }) => {
    const { total } = society.automations;
    await page.goto("/automazioni");
    await expect(page.getByText(`${total} su ${total} attive · 100%`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inviare le convocazioni" })).toBeVisible();
  });

  test("altro: le sezioni secondarie hanno dati", async ({ page }) => {
    for (const path of ["/altro/palestre", "/altro/sponsor", "/altro/bilancio", "/altro/bacheca", "/altro/arbitri", "/altro/statistiche"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveCount(0);
    }
  });
});
