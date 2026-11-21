import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import { mockQuoteApi } from "./support/quote-fixtures";

/** Lets enter animations (dialogs) finish so the colour contrast check reads the final colours. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

test.describe("pagamenti, segreteria", () => {
  test("shows the report and one card per plan with the three previews, without accessibility violations", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");

    await expect(page.getByRole("heading", { level: 1, name: /Incassi chiari, piano per piano/ })).toBeVisible();
    const report = page.getByRole("region", { name: "Rendiconto" });
    await expect(report.getByText("Incassato", { exact: true }).locator("../..")).toContainText(/€\s60/);
    await expect(report.getByText("Da incassare", { exact: true }).locator("../..")).toContainText(/€\s180/);
    await expect(page.getByText("Promemoria inviati")).toHaveCount(0);

    const card = page.getByRole("list", { name: "Piani", exact: true }).getByRole("listitem");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("link", { name: "Quota novembre" })).toHaveAttribute("href", "/quote/p-nov");
    await expect(card.getByText("persone in regola").locator("xpath=preceding-sibling::span[1]")).toHaveText("1");
    await expect(card.getByText("persone in attesa").locator("xpath=preceding-sibling::span[1]")).toHaveText("2");
    await expect(card.getByText("persone con quote scadute").locator("xpath=preceding-sibling::span[1]")).toHaveText("1");

    // the main page is only the overview: no list of names, no filters
    await expect(page.getByRole("list", { name: "Quote", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Cerca un tesserato")).toHaveCount(0);
    await expect(page.getByLabel("Squadra")).toHaveCount(0);

    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("opens a plan: report, people ordered by name with what they owe, search and filters inside", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");
    await page.getByRole("link", { name: "Quota novembre" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Quota novembre" })).toBeVisible();
    const report = page.getByRole("region", { name: "Rendiconto del piano" });
    await expect(report.getByText("Incassato", { exact: true }).locator("../..")).toContainText(/€\s60/);
    await expect(report.getByText("Quote scadute", { exact: true }).locator("../..")).toContainText("1 persona");

    const people = page.getByRole("list", { name: "Persone del piano" }).getByRole("listitem");
    await expect(people).toHaveCount(4);
    await expect(people.nth(0)).toContainText("Anna Ferri");
    await expect(people.nth(0)).toContainText(/€\s0/);
    await expect(people.nth(0)).toContainText("In regola");
    await expect(people.filter({ hasText: "Chiara Neri" })).toContainText("In attesa");
    await expect(people.filter({ hasText: "Marta Bianchi" })).toContainText("Scaduta");

    await page.getByRole("button", { name: "Scaduta", exact: true }).click();
    await expect(people).toHaveCount(1);
    await expect(people).toContainText("Marta Bianchi");
    await expect(report.getByText("In attesa", { exact: true }).locator("../..")).toContainText("2 persone");

    await page.getByRole("button", { name: "Tutti", exact: true }).click();
    await page.getByLabel("Squadra").selectOption({ label: "U16" });
    await expect(people).toHaveCount(2);
    await expect(page.getByRole("list", { name: "Persone del piano" })).not.toContainText("Anna Ferri");

    await page.getByLabel("Cerca un tesserato").fill("sara");
    await expect(people).toHaveCount(1);
    await expect(people).toContainText("Sara Conti");

    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("registers a payment with an idempotency key, issues the receipt and updates the plan", async ({ page }) => {
    const api = await mockQuoteApi(page);
    await page.goto("/quote/p-nov");

    await page.getByRole("button", { name: /Chiara Neri/ }).click();
    const fees = page.getByRole("dialog", { name: "Quote di Chiara Neri" });
    await fees.getByRole("button", { name: /^Chiara Neri/ }).click();
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
    await page.keyboard.press("Escape");
    const report = page.getByRole("region", { name: "Rendiconto del piano" });
    await expect(report.getByText("Incassato", { exact: true }).locator("../..")).toContainText(/€\s120/);
    await expect(page.getByRole("list", { name: "Persone del piano" }).getByRole("listitem").filter({ hasText: "Chiara Neri" })).toContainText("In regola");
  });

  test("creates a fee plan from the overview", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");
    await settle(page);

    await page.getByRole("button", { name: "Nuovo piano" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuovo piano quota" });
    await dialog.getByLabel(/Nome del piano/).fill("Quota dicembre");
    await dialog.getByLabel(/Importo di ogni pagamento/).fill("65");
    await dialog.getByRole("checkbox", { name: "U16" }).check();
    await dialog.getByRole("checkbox", { name: "U18" }).check();
    await dialog.getByLabel(/Quante volte si paga/).fill("3");
    await expect(dialog.getByLabel(/° pagamento/)).toHaveCount(3);
    const requestBody = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/fee-plans"));
    await dialog.getByRole("button", { name: "Crea il piano" }).click();
    await expect(page.getByText("Piano creato")).toBeVisible();
    expect((await requestBody).postDataJSON()).toMatchObject({
      name: "Quota dicembre",
      amountCents: 6500,
      teamIds: ["t-u16", "t-u18"],
    });
  });

  test("names the icons of a plan on hover", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");
    await settle(page);

    await page.getByRole("list", { name: "Piani" }).getByText("persone in regola").locator("..").hover();
    await expect(page.getByRole("tooltip")).toHaveText("persone in regola");
  });
});

test.describe("pagamenti, genitore", () => {
  test("sees only the own fees and can download receipts, without staff tools", async ({ page }) => {
    await mockQuoteApi(page, "athlete");
    await page.goto("/area-personale/pagamenti");

    await expect(page.getByRole("heading", { level: 1, name: /Incassi chiari/ })).toBeVisible();
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

test.describe("pagamenti su telefono", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("fits a 320px screen and has no accessibility violations, on the overview and inside a plan", async ({ page }) => {
    await mockQuoteApi(page);
    await page.goto("/quote");
    await expect(page.getByRole("link", { name: "Quota novembre" })).toBeVisible();
    await settle(page);

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.getByRole("link", { name: "Quota novembre" }).click();
    await expect(page.getByRole("list", { name: "Persone del piano" }).getByRole("listitem")).toHaveCount(4);
    await settle(page);
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    const row = page.getByRole("button", { name: /Marta Bianchi/ });
    const box = await row.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
