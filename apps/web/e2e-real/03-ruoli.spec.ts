import { expect, test } from "@playwright/test";
import { loginAs } from "./support/session";

// Role isolation against the real API: the athlete and the guardian see and do only what the SPEC allows.
// The demo match is fixed by the SPEC (Saturday 14 November 2026): these flows need it to be still ahead.
test.describe("ruoli sul backend reale", () => {
  test("l'atleta vede la propria convocazione e la conferma", async ({ page }) => {
    await loginAs(page, "atleta", "/calendario");
    const section = page.getByRole("region", { name: "Da confermare" });
    await expect(section).toContainText("Aquile Volley vs Delfini Volley");
    await expect(page.getByRole("button", { name: "Nuovo evento" })).toHaveCount(0);
    await page.getByRole("button", { name: /Confermo la presenza/ }).click();
    await expect(page.getByText("Presenza confermata", { exact: true })).toBeVisible();
  });

  test("l'atleta non accede alla gestione", async ({ page }) => {
    await loginAs(page, "atleta", "/tesserati");
    await expect(page.getByRole("button", { name: "Nuovo tesserato" })).toHaveCount(0);
    await page.goto("/automazioni");
    await expect(page.getByText("Sezione riservata")).toBeVisible();
  });

  test("il genitore vede solo le convocazioni della propria figlia, senza strumenti di gestione", async ({ page }) => {
    // The demo guardian is linked to Sara Conti (U16), who is not in the squad of the Serie D match.
    await loginAs(page, "genitore", "/calendario");
    await expect(page.getByRole("region", { name: "Da confermare" })).toContainText("Nessuna convocazione da confermare");
    await expect(page.getByRole("button", { name: "Nuovo evento" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Presenze allenamenti" })).toHaveCount(0);
  });

  test("dopo l'uscita le pagine private riportano al login", async ({ page }) => {
    await loginAs(page, "allenatore", "/");
    await page.getByRole("button", { name: "Esci" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/classifiche");
    await expect(page).toHaveURL(/\/login/);
  });
});
