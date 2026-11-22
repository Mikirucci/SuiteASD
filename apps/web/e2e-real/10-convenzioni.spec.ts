import { expect, test } from "@playwright/test";
import { createDemoSociety, type DemoSociety } from "./support/demo-society";
import { loginAs } from "./support/session";

// Convenzioni against the real API: the administration publishes an agreement for the whole society,
// an athlete and a guardian find their cards and are told about it. On a society built through the API.
test.describe("convenzioni sul backend reale", () => {
  let society: DemoSociety;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    society = await createDemoSociety();
  });

  test("the administration publishes a card for everybody, then athlete and guardian find theirs", async ({ page, browser }) => {
    await loginAs(page, society.people.admin, "/convenzioni");
    await page.getByRole("button", { name: "Nuova convenzione" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuova convenzione" });
    await form.getByLabel(/^Titolo della convenzione/).fill("Fisioterapia scontata");
    await form.getByLabel(/^Nome del partner/).fill("Therapia");
    await form.getByRole("radio", { name: "Oceano" }).click();
    await form.getByRole("checkbox", { name: "Tutti i tesserati" }).check();
    await form.getByRole("button", { name: "Salva la bozza" }).click();
    await expect(page.getByText("Bozza salvata")).toBeVisible();

    const item = page.getByRole("list", { name: "Convenzioni" }).getByRole("listitem").filter({ hasText: "Fisioterapia scontata" });
    await expect(item).toContainText("Bozza");
    await item.getByRole("button", { name: "Pubblica" }).click();
    await page.getByRole("dialog", { name: "Pubblicare la convenzione?" }).getByRole("button", { name: "Pubblica" }).click();
    await expect(page.getByText("Convenzione pubblicata")).toBeVisible();
    await expect(item).toContainText("Pubblicata");

    // The athlete has her own card, with her name
    const athlete = await (await browser.newContext()).newPage();
    await loginAs(athlete, society.people.atleta, "/area-personale/convenzioni");
    const athleteCards = athlete.getByRole("list", { name: "Convenzioni" }).getByRole("article");
    await expect(athleteCards).toHaveCount(1);
    await expect(athleteCards.first()).toContainText("Giulia Ferri");
    await expect(athleteCards.first()).toContainText("Therapia");

    // The guardian has the card of her child, with both names
    const guardian = await (await browser.newContext()).newPage();
    await loginAs(guardian, society.people.genitore, "/area-personale/convenzioni");
    const guardianCards = guardian.getByRole("list", { name: "Convenzioni" }).getByRole("article");
    await expect(guardianCards).toHaveCount(1);
    await expect(guardianCards.first()).toContainText("Sara Conti");
    await expect(guardianCards.first()).toContainText("Genitore: Elena Conti");

    // And both were told: the notification is in their list
    await athlete.goto("/area-personale/notifiche");
    await expect(athlete.getByRole("list", { name: "Notifiche", exact: true })).toContainText("Fisioterapia scontata");
  });

  test("an agreement for the coaches only is not seen by an athlete", async ({ page, browser }) => {
    await loginAs(page, society.people.admin, "/convenzioni");
    await page.getByRole("button", { name: "Nuova convenzione" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuova convenzione" });
    await form.getByLabel(/^Titolo della convenzione/).fill("Abbigliamento tecnico");
    await form.getByLabel(/^Nome del partner/).fill("Sport Point");
    await form.getByRole("checkbox", { name: "Allenatori" }).check();
    await form.getByRole("button", { name: "Salva la bozza" }).click();
    await expect(page.getByText("Bozza salvata")).toBeVisible();
    const item = page.getByRole("list", { name: "Convenzioni" }).getByRole("listitem").filter({ hasText: "Abbigliamento tecnico" });
    await item.getByRole("button", { name: "Pubblica" }).click();
    await page.getByRole("dialog", { name: "Pubblicare la convenzione?" }).getByRole("button", { name: "Pubblica" }).click();
    await expect(item).toContainText("Pubblicata");

    const coach = await (await browser.newContext()).newPage();
    await loginAs(coach, society.people.allenatore, "/convenzioni/mie");
    await expect(coach.getByRole("list", { name: "Convenzioni" })).toContainText("Abbigliamento tecnico");

    const athlete = await (await browser.newContext()).newPage();
    await loginAs(athlete, society.people.atleta, "/area-personale/convenzioni");
    await expect(athlete.getByRole("list", { name: "Convenzioni" })).not.toContainText("Abbigliamento tecnico");
  });
});
