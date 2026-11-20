import { expect, test } from "@playwright/test";
import { createDemoSociety, type DemoSociety } from "./support/demo-society";
import { loginAs } from "./support/session";

// Writes against the real API, on a society of its own (see support/demo-society.ts).
test.describe("scritture sul backend reale", () => {
  test.describe.configure({ mode: "serial" });
  let society: DemoSociety;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    society = await createDemoSociety();
  });

  test("la segreteria registra un tesserato e lo ritrova nella lista", async ({ page }) => {
    await loginAs(page, society.people.segreteria, "/tesserati");
    await page.getByRole("button", { name: "Nuovo tesserato" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuovo tesserato" });
    await dialog.getByRole("textbox", { name: "Nome", exact: true }).fill("Linda");
    await dialog.getByRole("textbox", { name: "Cognome", exact: true }).fill("Zanetti");
    await dialog.getByRole("checkbox", { name: society.teamNames.u16 }).check();
    await dialog.getByRole("button", { name: "Aggiungi tesserato" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Linda Zanetti" })).toBeVisible();

    await page.goto("/tesserati");
    await page.getByRole("searchbox", { name: "Cerca tesserato" }).fill("Zanetti");
    await expect(page.getByRole("list", { name: "Tesserati" }).getByRole("listitem")).toHaveCount(1);
  });

  test("la segreteria cerca Linda dalla pagina della squadra U12 e la aggiunge con un clic", async ({ page }) => {
    const team = society.teamNames.u12;
    await loginAs(page, society.people.segreteria, "/squadre");
    await page.getByRole("link", { name: team, exact: true }).click();
    await page.getByRole("button", { name: "Aggiungi atleti" }).click();
    const dialog = page.getByRole("dialog", { name: `Aggiungi atleti a ${team}` });
    await dialog.getByRole("searchbox", { name: "Cerca tesserato" }).fill("Zanetti");
    await dialog.getByText("Linda Zanetti").click();
    await dialog.getByRole("button", { name: "Aggiungi 1 atleta" }).click();
    await expect(page.getByText("1 atleta aggiunto")).toBeVisible();
    await expect(page.getByRole("table", { name: `Rosa di ${team}` }).getByRole("link", { name: "Linda Zanetti" })).toBeVisible();
  });

  test("la segreteria registra un pagamento e la ricevuta numerata parte da sola", async ({ page }) => {
    const { feePlan, alice } = society;
    await loginAs(page, society.people.segreteria, "/quote");
    await page.getByRole("link", { name: feePlan.name }).click();
    await page.getByRole("button", { name: new RegExp(alice.fullName) }).click();
    await page.getByRole("dialog", { name: `Quote di ${alice.fullName}` }).getByRole("button", { name: new RegExp(`^${alice.fullName}`) }).click();
    const card = page.getByRole("dialog", { name: alice.fullName });
    await card.getByRole("button", { name: "Registra pagamento" }).click();
    const form = page.getByRole("dialog", { name: "Registra pagamento" });
    await form.getByLabel("Metodo di pagamento").selectOption("BANK_TRANSFER");
    await form.getByLabel("Riferimento").fill("CRO E2E 0001");
    await form.getByRole("button", { name: "Conferma pagamento" }).click();

    const issued = page.getByText(new RegExp(`Ricevuta n\\. \\d+ emessa per ${alice.fullName}\\.`));
    await expect(issued).toBeVisible();
    const number = /n\. (\d+)/.exec((await issued.textContent()) ?? "")?.[1];
    const download = page.waitForEvent("download");
    await page.getByRole("dialog", { name: alice.fullName }).getByRole("button", { name: "Scarica ricevuta" }).click();
    expect((await download).suggestedFilename()).toBe(`ricevuta-${number}.pdf`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const report = page.getByRole("region", { name: "Rendiconto del piano" });
    await expect(report.getByText("Incassato", { exact: true }).locator("../..")).toContainText(new RegExp(`€\\s${(feePlan.paid + 1) * feePlan.amountEuro}`));
  });

  test("l'amministratore spegne un'automazione e la percentuale scende", async ({ page }) => {
    const { total, toggled } = society.automations;
    const percent = (active: number): string => `${active} su ${total} attive · ${Math.round((active / total) * 100)}%`;
    await loginAs(page, society.people.admin, "/automazioni");
    await page.getByRole("switch", { name: `Attiva ${toggled.name}` }).click();
    await expect(page.getByText(percent(total - 1))).toBeVisible();
    await page.reload();
    await expect(page.getByText(percent(total - 1))).toBeVisible();
    await page.getByRole("switch", { name: `Attiva ${toggled.name}` }).click();
    await expect(page.getByText(percent(total))).toBeVisible();
  });
});
