import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockQuoteApi } from "./support/quote-fixtures";

/** Lets enter animations (tab content, dialogs) finish so the colour contrast check reads the final colours. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

test.describe("quote e pagamenti, segreteria", () => {
  test("shows the summary and the status of every member, without accessibility violations", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");

    await expect(page.getByRole("heading", { level: 1, name: /Quote incassate, senza rincorrere/ })).toBeVisible();
    const summary = page.getByText("Incassato", { exact: true }).locator("..");
    await expect(summary).toContainText(/€\s60/);
    await expect(page.getByText("Promemoria inviati", { exact: true }).locator("..")).toContainText("2");

    const list = page.getByRole("list", { name: "Quote", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(4);
    await expect(list.getByRole("listitem").filter({ hasText: "Anna Ferri" })).toContainText("Pagato");
    await expect(list.getByRole("listitem").filter({ hasText: "Anna Ferri" })).toContainText("Ricevuta n. 0146");
    await expect(list.getByRole("listitem").filter({ hasText: "Chiara Neri" })).toContainText("In attesa");
    await expect(list.getByRole("listitem").filter({ hasText: "Marta Bianchi" })).toContainText("Scaduto");

    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("filters by status and by team", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");
    const list = page.getByRole("list", { name: "Quote", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(4);

    await page.getByRole("button", { name: "Scaduto", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Marta Bianchi");

    await page.getByRole("button", { name: "Tutte", exact: true }).click();
    await page.getByLabel("Squadra").selectOption({ label: "U16" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).not.toContainText("Anna Ferri");

    await page.getByLabel("Cerca un tesserato").fill("sara");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Sara Conti");
  });

  test("registers a payment with an idempotency key, issues the receipt and downloads it", async ({ page }) => {
    const api = await mockQuoteApi(page);
    await page.goto("/quote");

    await page.getByRole("button", { name: /Chiara Neri/ }).click();
    const card = page.getByRole("dialog", { name: "Chiara Neri" });
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await card.getByRole("button", { name: "Registra pagamento" }).click();

    const form = page.getByRole("dialog", { name: "Registra pagamento" });
    await form.getByLabel("Metodo di pagamento").selectOption("BANK_TRANSFER");
    await form.getByLabel("Riferimento").fill("CRO 123456");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await form.getByRole("button", { name: "Conferma pagamento" }).click();

    await expect(page.getByText("Ricevuta n. 0147 emessa per Chiara Neri.")).toBeVisible();
    expect(api.paymentKeys).toHaveLength(1);
    expect(api.paymentKeys[0]).toMatch(/^[\w.:-]{8,128}$/);

    const paidCard = page.getByRole("dialog", { name: "Chiara Neri" });
    await expect(paidCard).toContainText("n. 0147");
    await expect(paidCard).toContainText("Bonifico");
    await expect(paidCard.getByRole("button", { name: "Registra pagamento" })).toHaveCount(0);

    const download = page.waitForEvent("download");
    await paidCard.getByRole("button", { name: "Scarica ricevuta" }).click();
    expect((await download).suggestedFilename()).toBe("ricevuta-0147.pdf");

    await page.keyboard.press("Escape");
    await expect(page.getByText("Incassato", { exact: true }).locator("..")).toContainText(/€\s120/);
    await expect(page.getByRole("list", { name: "Quote", exact: true }).getByRole("listitem").filter({ hasText: "Chiara Neri" })).toContainText("Pagato");
  });

  test("creates a fee plan from the plans tab", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");
    await page.getByRole("tab", { name: "Piani quota" }).click();
    await expect(page.getByRole("list", { name: "Piani quota" })).toContainText("Quota novembre");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("button", { name: "Nuovo piano" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuovo piano quota" });
    await dialog.getByLabel(/Nome del piano/).fill("Quota dicembre");
    await dialog.getByLabel(/Importo in euro/).fill("65");
    await dialog.getByRole("button", { name: "Crea il piano" }).click();
    await expect(page.getByText("Piano creato")).toBeVisible();
  });
});

test.describe("quote e pagamenti, genitore", () => {
  test("sees only the own fees and can download receipts, without staff tools", async ({ page }) => {
    await mockQuoteApi(page, "athlete");
    await page.goto("/area-personale/pagamenti");

    await expect(page.getByRole("heading", { level: 1, name: /Quote incassate/ })).toBeVisible();
    const list = page.getByRole("list", { name: "Quote", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).not.toContainText("Marta Bianchi");
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByLabel("Squadra")).toHaveCount(0);
    await expect(page.getByText("Incassato", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /Anna Ferri/ }).click();
    const card = page.getByRole("dialog", { name: "Anna Ferri" });
    await expect(card.getByRole("button", { name: "Scarica ricevuta" })).toBeVisible();
    const download = page.waitForEvent("download");
    await card.getByRole("button", { name: "Scarica ricevuta" }).click();
    expect((await download).suggestedFilename()).toBe("ricevuta-0146.pdf");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Chiara Neri/ }).click();
    await expect(page.getByRole("dialog", { name: "Chiara Neri" }).getByRole("button", { name: "Registra pagamento" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});

test.describe("quote e pagamenti su telefono", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("fits a 320px screen and has no accessibility violations", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");
    await expect(page.getByRole("list", { name: "Quote", exact: true }).getByRole("listitem")).toHaveCount(4);
    await settle(page);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    const row = page.getByRole("button", { name: /Marta Bianchi/ });
    const box = await row.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
