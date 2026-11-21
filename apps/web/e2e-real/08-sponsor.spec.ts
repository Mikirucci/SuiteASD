import { expect, test } from "@playwright/test";
import { loginAs } from "./support/session";

// Sponsor against the real API: the totals on top follow the contracts, and a contract can be attached while registering.
// Demo society: 2026, Aquile Volley.
test.describe("sponsor sul backend reale", () => {
  test("i totali seguono i contratti e un nuovo sponsor nasce con il contratto allegato", async ({ page }) => {
    await loginAs(page, "admin", "/altro/sponsor");
    const tiles = page.getByRole("region", { name: "Riepilogo degli sponsor" });
    const cards = page.getByRole("list", { name: "Sponsor", exact: true });
    await expect(cards.getByRole("listitem").filter({ hasText: "Autofficina Bianchi" })).toContainText("Attivo");
    const activeBefore = Number(await tiles.getByText("Attivi").locator("../..").locator("p").nth(1).innerText());

    await page.getByRole("button", { name: "Nuovo sponsor" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuovo sponsor" });
    await form.getByLabel(/Nome dello sponsor/).fill("Libreria Verdi");
    await form.getByLabel(/Importo del contratto/).fill("1200");
    await form.getByLabel("File da allegare").setInputFiles({ name: "contratto-verdi.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%test") });
    await form.getByRole("button", { name: "Crea lo sponsor" }).click();
    await expect(page.getByText("Sponsor creato")).toBeVisible();

    // the totals are read again: one more active sponsor, worth what was written
    await expect(tiles.getByText("Attivi").locator("../..").locator("p").nth(1)).toHaveText(String(activeBefore + 1));
    const card = cards.getByRole("listitem").filter({ hasText: "Libreria Verdi" });
    await expect(card).toContainText(/€\s1200/);

    // the contract is among the attachments, inside the detail the card opens
    await card.getByRole("button", { name: "Libreria Verdi" }).click();
    const dialog = page.getByRole("dialog", { name: "Libreria Verdi" });
    await expect(dialog.getByRole("list", { name: "Allegati di Libreria Verdi" })).toContainText("contratto-verdi.pdf");
  });

  test("uno sponsor firmato entra nelle entrate, ne segue il contratto e sparisce con lui", async ({ page }) => {
    await loginAs(page, "admin", "/altro/sponsor");
    const incomes = () => page.getByRole("list", { name: "Entrate", exact: true });
    const entry = () => incomes().getByRole("listitem").filter({ hasText: "Cartoleria Neri" });

    // registered with an amount and a start: it is an income of the club, under Sponsor, the same moment
    await page.getByRole("button", { name: "Nuovo sponsor" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuovo sponsor" });
    await form.getByLabel(/Nome dello sponsor/).fill("Cartoleria Neri");
    await form.getByLabel(/Importo del contratto/).fill("800");
    await form.getByLabel("Inizio del contratto").fill("2026-10-01");
    await form.getByRole("button", { name: "Crea lo sponsor" }).click();
    await expect(page.getByText("Sponsor creato")).toBeVisible();

    await page.goto("/altro/entrate/Sponsor");
    await expect(entry()).toContainText(/\+\s€\s800/);
    await expect(entry()).toContainText("Sponsor");
    // it is not written here: the entry belongs to the contract
    await entry().getByRole("button", { name: "Cartoleria Neri" }).click();
    const owned = page.getByRole("dialog", { name: "Cartoleria Neri" });
    await expect(owned.getByText("Registrata da Sponsor")).toBeVisible();
    await expect(owned.getByLabel(/Importo in euro/)).toBeDisabled();
    await owned.getByRole("link", { name: "Vai a Sponsor" }).click();
    await expect(page).toHaveURL(/\/altro\/sponsor$/);

    // the contract changes: the income follows
    await page.getByRole("button", { name: "Cartoleria Neri" }).click();
    const detail = page.getByRole("dialog", { name: "Cartoleria Neri" });
    await detail.getByLabel(/Importo del contratto/).fill("1000");
    await detail.getByRole("button", { name: "Salva le modifiche" }).click();
    await expect(page.getByText("Sponsor aggiornato")).toBeVisible();
    await page.goto("/altro/entrate/Sponsor");
    await expect(entry()).toContainText(/\+\s€\s1000/);

    // a prospect has signed nothing: no income
    await page.goto("/altro/sponsor");
    await page.getByRole("button", { name: "Cartoleria Neri" }).click();
    await page.getByRole("dialog", { name: "Cartoleria Neri" }).getByLabel("Stato").selectOption("PROSPECT");
    await page.getByRole("dialog", { name: "Cartoleria Neri" }).getByRole("button", { name: "Salva le modifiche" }).click();
    await expect(page.getByText("Sponsor aggiornato").first()).toBeVisible();
    await page.goto("/altro/entrate/Sponsor");
    await expect(incomes()).toBeVisible();
    await expect(entry()).toHaveCount(0);

    // signed again and then removed: the income goes with the sponsor
    await page.goto("/altro/sponsor");
    await page.getByRole("button", { name: "Cartoleria Neri" }).click();
    await page.getByRole("dialog", { name: "Cartoleria Neri" }).getByLabel("Stato").selectOption("ACTIVE");
    await page.getByRole("dialog", { name: "Cartoleria Neri" }).getByRole("button", { name: "Salva le modifiche" }).click();
    await expect(page.getByText("Sponsor aggiornato").first()).toBeVisible();
    await page.getByRole("button", { name: "Cartoleria Neri" }).click();
    await page.getByRole("dialog", { name: "Cartoleria Neri" }).getByRole("button", { name: "Elimina" }).click();
    await page.getByRole("dialog", { name: "Eliminare Cartoleria Neri?" }).getByRole("button", { name: "Elimina" }).click();
    await expect(page.getByText("Sponsor eliminato")).toBeVisible();
    await page.goto("/altro/entrate/Sponsor");
    await expect(incomes()).toBeVisible();
    await expect(entry()).toHaveCount(0);
  });
});
