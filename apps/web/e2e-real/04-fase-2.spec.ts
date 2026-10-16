import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, loginAs } from "./support/session";

const PDF = { name: "documento.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 documento di prova") };

// Administration and personal area working together against the real API (SPEC addendum, docs/DECISIONS.md D-20..D-25).
test.describe("iscrizione, area personale e amministrazione sul backend reale", () => {
  test("l'atleta si iscrive da link, carica il certificato e l'amministrazione lo vede da sola", async ({ page }) => {
    const email = `nuova.atleta.${Date.now()}@example.it`;

    await page.goto("/iscrizione/iscrizione-demo-u16");
    await expect(page.getByRole("heading", { level: 1, name: /Iscriviti in due minuti/ })).toBeVisible();
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Greta");
    await page.getByRole("textbox", { name: "Cognome", exact: true }).fill("Bellandi");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
    await page.getByLabel("Data di nascita").fill("2011-03-10");
    await page.getByRole("button", { name: "Completa l'iscrizione" }).click();
    await expect(page).toHaveURL(/\/area-personale$/);

    await page.goto("/area-personale/documenti");
    await expect(page.getByRole("heading", { level: 2, name: "I tuoi documenti" })).toBeVisible();
    await page.getByRole("button", { name: "Carica Certificato medico" }).click();
    const dialog = page.getByRole("dialog", { name: /Carica un documento · Greta Bellandi/ });
    await dialog.getByLabel("Data di scadenza").fill("2030-06-30");
    await dialog.getByLabel(/^File/).setInputFiles(PDF);
    await dialog.getByRole("button", { name: "Carica il documento" }).click();
    await expect(page.getByText("Documento caricato")).toBeVisible();
    await expect(page.getByRole("list", { name: "Documenti richiesti" }).getByRole("listitem").filter({ hasText: "Certificato medico" })).toContainText("Scade il 30 giugno 2030");

    await page.getByRole("button", { name: "Esci" }).click();
    await expect(page).toHaveURL(/\/login/);

    await loginAs(page, "admin", "/tesserati");
    await page.getByRole("searchbox", { name: "Cerca tesserato" }).fill("Bellandi");
    const list = page.getByRole("list", { name: "Tesserati" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await list.getByRole("link", { name: /Greta Bellandi/ }).click();
    await expect(page.getByRole("list", { name: "Documenti del tesserato" })).toContainText("Certificato medico");

    await page.goto("/notifiche");
    await expect(page.getByRole("list", { name: "Notifiche", exact: true })).toContainText("Greta Bellandi");
  });

  test("il report per il commercialista si scarica come PDF, completo e per sezione", async ({ page }) => {
    await loginAs(page, "admin", "/altro/bilancio");
    await expect(page.getByRole("heading", { name: "Report per il commercialista" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Sezioni del report" }).getByRole("listitem")).toHaveCount(5);

    const full = page.waitForEvent("download");
    await page.getByRole("button", { name: "Scarica il report completo" }).click();
    const fullDownload = await full;
    expect(fullDownload.suggestedFilename()).toMatch(/^report-aquile-volley-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.pdf$/);
    const header = (await readFile((await fullDownload.path()) ?? "")).subarray(0, 5).toString("latin1");
    expect(header).toBe("%PDF-");

    const single = page.waitForEvent("download");
    await page.getByRole("button", { name: "Scarica solo Quote e incassi" }).click();
    expect((await single).suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("un file allegato a una palestra resta legato alla voce e si può eliminare", async ({ page }) => {
    await loginAs(page, "admin", "/altro/palestre");
    await page.getByRole("button", { name: "Allegati di Palazzetto dello Sport" }).click();
    const dialog = page.getByRole("dialog", { name: "Allegati · Palazzetto dello Sport" });
    await expect(dialog.getByText("Nessun allegato")).toBeVisible();

    await dialog.getByLabel("Nome del documento").fill("Contratto 2026");
    await dialog.getByLabel("File da allegare a Palazzetto dello Sport").setInputFiles(PDF);
    await expect(page.getByText("File allegato")).toBeVisible();
    const attachments = dialog.getByRole("list", { name: "Allegati di Palazzetto dello Sport" });
    await expect(attachments).toContainText("Contratto 2026");

    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Scarica Contratto 2026" }).click();
    expect((await download).suggestedFilename()).toBe("documento.pdf");

    await dialog.getByRole("button", { name: "Elimina Contratto 2026" }).click();
    await page.getByRole("dialog", { name: "Eliminare Contratto 2026?" }).getByRole("button", { name: "Elimina", exact: true }).click();
    await expect(dialog.getByText("Nessun allegato")).toBeVisible();
  });
});
