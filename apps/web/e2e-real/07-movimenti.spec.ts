import { expect, test } from "@playwright/test";
import { createDemoSociety, dayAhead, type DemoSociety } from "./support/demo-society";
import { loginAs } from "./support/session";

const euro = (cents: number): RegExp => new RegExp(`€\\s${cents / 100}`);
const monthOf = (days: number): string =>
  new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" }).format(new Date(`${dayAhead(days)}T12:00:00Z`));

// Uscite against the real API: the expenses entered here and the costs that other sections book end up in one balance
// (docs/DECISIONS.md D-50, D-60), on a society built through the API (support/demo-society.ts).
test.describe("uscite e bilancio sul backend reale", () => {
  let society: DemoSociety;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    society = await createDemoSociety();
  });

  test("le spese registrate e i costi di trasferte e arbitri stanno insieme, per categoria, con il fornitore", async ({ page }) => {
    await loginAs(page, society.people.admin, "/altro/uscite");
    await expect(page.getByRole("heading", { level: 1, name: /Dove vanno i soldi/ })).toBeVisible();

    const tiles = page.getByRole("region", { name: "Rendiconto delle uscite" });
    const { money } = society;
    const booked = money.venueCostCents + money.tripCostCents + money.refereeFeeCents;
    await expect(tiles.getByText("Spese del periodo").locator("../..")).toContainText(euro(money.manualExpense.cents + booked));
    await expect(tiles.getByText("Registrate qui").locator("../..")).toContainText(euro(money.manualExpense.cents));
    await expect(tiles.getByText("Da altre sezioni").locator("../..")).toContainText(euro(booked));

    // one card per category
    const cards = page.getByRole("list", { name: "Categorie", exact: true });
    for (const category of ["Palestre", society.money.manualExpense.category, "Arbitri", "Trasferte"]) {
      await expect(cards.getByRole("listitem").filter({ hasText: category }).first()).toBeVisible();
    }

    // the page of a category lists its expenses
    await cards.getByRole("link", { name: society.money.manualExpense.category }).click();
    await expect(page.getByRole("heading", { level: 1, name: society.money.manualExpense.category })).toBeVisible();
    const palloni = page.getByRole("list", { name: "Spese", exact: true }).getByRole("listitem").filter({ hasText: society.money.manualExpense.name });
    await expect(palloni).toContainText(`${society.money.manualExpense.category} · ${society.money.manualExpense.supplier}`);
    await expect(palloni).toContainText(new RegExp(`−\\s€\\s${society.money.manualExpense.cents / 100}`));

    // the fees of the referees and the cost of the trips are booked by their own sections: read-only here, with the way there
    await page.getByRole("link", { name: "Tutte le uscite" }).click();
    await cards.getByRole("link", { name: "Arbitri" }).click();
    await expect(page.getByRole("link", { name: "Vai a Arbitri" }).first()).toHaveAttribute("href", "/altro/arbitri");
    const referee = page.getByRole("list", { name: "Spese", exact: true }).getByRole("listitem").filter({ hasText: society.money.refereeName }).first();
    await expect(referee.getByText("Arbitro", { exact: true })).toBeVisible();
    await referee.getByRole("button", { name: new RegExp(society.money.refereeName) }).click();
    await expect(page.getByRole("dialog", { name: new RegExp(society.money.refereeName) }).getByText(/si cambia dalla designazione/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Tutte le uscite" }).click();
    await cards.getByRole("link", { name: "Trasferte" }).click();
    await page.getByRole("list", { name: "Spese", exact: true }).getByRole("listitem").first().getByRole("button").click();
    await expect(page.getByRole("dialog").getByText(/si cambia dalla trasferta/)).toBeVisible();
  });

  test("il periodo si sceglie una volta, sta nell'indirizzo e vale anche dentro una categoria", async ({ page }) => {
    await loginAs(page, society.people.admin, "/altro/uscite");
    const cards = page.getByRole("list", { name: "Categorie", exact: true });
    await expect(cards.getByRole("listitem").first()).toBeVisible();

    // a year without expenses (the society was born today): the cards give way to the explanation
    for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "Periodo precedente" }).click();
    await expect(page.getByRole("heading", { name: "Nessuna spesa in questo periodo" })).toBeVisible();
    await expect(page).toHaveURL(/dal=\d{4}-01-01&al=\d{4}-12-31/);

    // the month of the venue cost, chosen from the panel: only what happened in it
    await page.getByRole("button", { name: "Azzera filtri" }).click();
    await expect(cards.getByRole("listitem").first()).toBeVisible();
    await page.getByRole("group", { name: "Periodo", exact: true }).getByRole("button", { name: String(new Date().getFullYear()) }).click();
    const panel = page.getByRole("dialog", { name: "Scegli il periodo" });
    await panel.getByRole("tab", { name: "Mese" }).click();
    const month = monthOf(-5);
    await panel.getByRole("button", { name: month }).click();
    await expect(page.getByRole("group", { name: "Periodo", exact: true })).toContainText(new RegExp(month, "i"));
    await expect(cards.getByRole("listitem").filter({ hasText: "Palestre" })).toContainText(euro(society.money.venueCostCents));

    // the category page opens with the same month, and the way back keeps it
    await cards.getByRole("link", { name: "Palestre" }).click();
    await expect(page.getByRole("group", { name: "Periodo", exact: true })).toContainText(new RegExp(month, "i"));
    await expect(page.getByRole("list", { name: "Spese", exact: true }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("link", { name: "Tutte le uscite" }).click();
    await expect(page.getByRole("group", { name: "Periodo", exact: true })).toContainText(new RegExp(month, "i"));
  });

  test("una spesa nuova entra nel bilancio con la sua categoria, e una categoria già usata si riconosce anche scritta diversamente", async ({ page }) => {
    await loginAs(page, society.people.admin, "/altro/uscite");
    await page.getByRole("button", { name: "Nuova spesa" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuova spesa" });
    await form.getByLabel(/Nome della spesa/).fill("Gazebo per il torneo");
    await form.getByLabel(/Categoria/).fill("Eventi del club");
    await form.getByLabel(/Importo in euro/).fill("120");
    await form.getByLabel(/Fornitore/).fill("Brico Casa");
    await form.getByRole("button", { name: "Registra la spesa" }).click();
    await expect(page.getByText("Spesa registrata")).toBeVisible();

    // the category is new: it has its own card, with the new expense inside its page
    const cards = page.getByRole("list", { name: "Categorie", exact: true });
    const card = cards.getByRole("listitem").filter({ hasText: "Eventi del club" });
    await expect(card).toContainText(/€\s120/);
    await card.getByRole("link", { name: "Eventi del club" }).click();
    const list = page.getByRole("list", { name: "Spese", exact: true });
    await expect(list.getByRole("listitem").filter({ hasText: "Gazebo per il torneo" })).toContainText("Eventi del club · Brico Casa");

    // the same category written in capitals joins the one that exists: a single line in the balance
    await page.getByRole("button", { name: "Nuova spesa" }).first().click();
    const second = page.getByRole("dialog", { name: "Nuova spesa" });
    await second.getByLabel(/Nome della spesa/).fill("Bandierine");
    await second.getByLabel(/Categoria/).fill("EVENTI  del club");
    await second.getByLabel(/Importo in euro/).fill("30");
    await second.getByRole("button", { name: "Registra la spesa" }).click();
    await expect(page.getByText("Spesa registrata").first()).toBeVisible();
    // same page, now with both expenses and their total
    await expect(list.getByRole("listitem").filter({ hasText: "Bandierine" })).toContainText("Eventi del club");
    await expect(page.getByRole("region", { name: "Rendiconto della categoria" })).toContainText(/€\s150/);
  });

  test("il bilancio legge le stesse uscite delle uscite, e lo stesso vale per le entrate", async ({ page }) => {
    const figure = async (region: string, label: string): Promise<string> => {
      const text = await page.getByRole("region", { name: region }).getByText(label, { exact: true }).locator("../..").innerText();
      return /€\s?([\d.]+)/.exec(text)?.[1] ?? "";
    };
    await loginAs(page, society.people.admin, "/altro/uscite");
    const spent = await figure("Rendiconto delle uscite", "Spese del periodo");
    await page.goto("/altro/entrate");
    const earned = await figure("Rendiconto delle entrate", "Entrate del periodo");
    expect(spent).not.toBe("");
    expect(earned).not.toBe("");

    await page.goto("/altro/bilancio");
    await expect(page.getByRole("region", { name: "Riepilogo del periodo" })).toBeVisible();
    expect(await figure("Riepilogo del periodo", "Uscite")).toBe(spent);
    expect(await figure("Riepilogo del periodo", "Entrate")).toBe(earned);
  });
});
