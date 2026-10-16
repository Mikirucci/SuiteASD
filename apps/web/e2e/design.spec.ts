import { expect, test } from "@playwright/test";
import { auditAccessibility } from "./support/axe";

test.describe("/design", () => {
  test("renders every section without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/design");

    await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
    for (const title of [
      "Colori, testo e spazio, in un solo posto.",
      "Pulsanti con ogni stato visibile.",
      "Moduli chiari, con errori leggibili.",
      "Chi è chi, e a che punto siamo.",
      "Elenchi, progressi e calendari.",
      "Sempre chiaro cosa sta succedendo.",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
    // Let the entrance animations settle so contrast is measured on final colours
    await page.waitForTimeout(1500);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("dialog traps focus, closes with Escape and returns focus", async ({ page }) => {
    await page.goto("/design");
    const trigger = page.getByRole("button", { name: "Apri finestra" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Eliminare Sara Conti?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("toast is announced and dismissable", async ({ page }) => {
    await page.goto("/design");
    await page.getByRole("button", { name: "Successo" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Promemoria inviato" });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Chiudi notifica" }).click();
    await expect(toast).toBeHidden();
  });

  test.describe("on a 320px screen", () => {
    test.use({ viewport: { width: 320, height: 720 } });

    test("the week strip keeps 44px targets and the page does not scroll sideways", async ({ page }) => {
      await page.goto("/design");
      const strip = page.getByRole("group", { name: "Giorni della settimana" });
      await expect(strip).toBeVisible();
      await page.waitForTimeout(1500);

      const days = await strip.getByRole("button").all();
      expect(days).toHaveLength(7);
      for (const day of days) {
        const box = await day.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      const stripBox = await strip.boundingBox();
      expect((stripBox?.x ?? -1) + (stripBox?.width ?? 0)).toBeLessThanOrEqual(320);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });

  test("tabs and week strip respond to the keyboard", async ({ page }) => {
    await page.goto("/design");
    await page.getByRole("tab", { name: "Documenti" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Pagamenti" })).toHaveAttribute("aria-selected", "true");

    const friday = page.getByRole("button", { name: /^ven 13 novembre/i });
    await friday.focus();
    await page.keyboard.press("Enter");
    await expect(friday).toHaveAttribute("aria-pressed", "true");
  });
});
