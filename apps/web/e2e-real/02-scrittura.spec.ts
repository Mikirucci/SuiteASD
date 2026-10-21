import { expect, test } from "@playwright/test";
import { loginAs } from "./support/session";

// Writes against the real API. Runs after the read-only tour: the seeded numbers there are the untouched ones.
test.describe("scritture sul backend reale", () => {
  test("la segreteria registra un tesserato e lo ritrova nella lista", async ({ page }) => {
    await loginAs(page, "segreteria", "/tesserati");
    await page.getByRole("button", { name: "Nuovo tesserato" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuovo tesserato" });
    await dialog.getByRole("textbox", { name: "Nome", exact: true }).fill("Linda");
    await dialog.getByRole("textbox", { name: "Cognome", exact: true }).fill("Zanetti");
    await dialog.getByRole("checkbox", { name: "U18" }).check();
    await dialog.getByRole("button", { name: "Aggiungi tesserato" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Linda Zanetti" })).toBeVisible();

    await page.goto("/tesserati");
    await page.getByRole("searchbox", { name: "Cerca tesserato" }).fill("Zanetti");
    await expect(page.getByRole("list", { name: "Tesserati" }).getByRole("listitem")).toHaveCount(1);
  });

  test("la segreteria cerca Linda dalla pagina della squadra U12 e la aggiunge con un clic", async ({ page }) => {
    await loginAs(page, "segreteria", "/squadre");
    await page.getByRole("link", { name: "U12", exact: true }).click();
    await page.getByRole("button", { name: "Aggiungi atleti" }).click();
    const dialog = page.getByRole("dialog", { name: "Aggiungi atleti a U12" });
    await dialog.getByRole("searchbox", { name: "Cerca tesserato" }).fill("Zanetti");
    await dialog.getByText("Linda Zanetti").click();
    await dialog.getByRole("button", { name: "Aggiungi 1 atleta" }).click();
    await expect(page.getByText("1 atleta aggiunto")).toBeVisible();
    await expect(page.getByRole("table", { name: "Rosa di U12" }).getByRole("link", { name: "Linda Zanetti" })).toBeVisible();
  });

  test("la segreteria registra un pagamento e la ricevuta numerata parte da sola", async ({ page }) => {
    await loginAs(page, "segreteria", "/quote");
    await page.getByRole("link", { name: "Quota novembre" }).click();
    await page.getByRole("button", { name: /Alice Moretti/ }).click();
    await page.getByRole("dialog", { name: "Quote di Alice Moretti" }).getByRole("button", { name: /^Alice Moretti/ }).click();
    const card = page.getByRole("dialog", { name: "Alice Moretti" });
    await card.getByRole("button", { name: "Registra pagamento" }).click();
    const form = page.getByRole("dialog", { name: "Registra pagamento" });
    await form.getByLabel("Metodo di pagamento").selectOption("BANK_TRANSFER");
    await form.getByLabel("Riferimento").fill("CRO E2E 0001");
    await form.getByRole("button", { name: "Conferma pagamento" }).click();

    await expect(page.getByText("Ricevuta n. 0148 emessa per Alice Moretti.")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("dialog", { name: "Alice Moretti" }).getByRole("button", { name: "Scarica ricevuta" }).click();
    expect((await download).suggestedFilename()).toBe("ricevuta-0148.pdf");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const report = page.getByRole("region", { name: "Rendiconto del piano" });
    await expect(report.getByText("Incassato", { exact: true }).locator("../..")).toContainText(/€\s300/);
  });

  test("l'amministratore spegne un'automazione e la percentuale scende", async ({ page }) => {
    await loginAs(page, "admin", "/automazioni");
    await page.getByRole("switch", { name: "Attiva Ricordare le quote" }).click();
    await expect(page.getByText("9 su 10 attive · 90%")).toBeVisible();
    await page.reload();
    await expect(page.getByText("9 su 10 attive · 90%")).toBeVisible();
    await page.getByRole("switch", { name: "Attiva Ricordare le quote" }).click();
    await expect(page.getByText("10 su 10 attive · 100%")).toBeVisible();
  });
});
