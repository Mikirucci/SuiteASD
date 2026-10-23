import { expect, test } from "@playwright/test";
import { loginAs } from "./support/session";

// Spese against the real API: the expenses entered here and the costs that other sections book end up in one balance
// (docs/DECISIONS.md D-50). Demo society: 2026, Aquile Volley.
test.describe("spese e bilancio sul backend reale", () => {
  test("le spese registrate e i costi di trasferte e arbitri stanno insieme, con la categoria e il fornitore", async ({ page }) => {
    await loginAs(page, "admin", "/altro/spese");
    await expect(page.getByRole("heading", { level: 1, name: /Ogni spesa, al suo posto/ })).toBeVisible();

    const list = page.getByRole("list", { name: "Spese", exact: true });
    const palloni = list.getByRole("listitem").filter({ hasText: "Palloni da gara e carrello" });
    await expect(palloni).toContainText("Attrezzatura sportiva · Volley Shop Emilia");
    await expect(palloni).toContainText(/−\s€\s640/);

    // the fees of the referees and the cost of the trips are booked by their own sections: read-only here
    const referee = list.getByRole("listitem").filter({ hasText: "Roberto Cattaneo" }).first();
    await expect(referee.getByText("Arbitro", { exact: true })).toBeVisible();
    await expect(referee).toContainText("si modifica dalla designazione");
    await expect(list.getByRole("listitem").filter({ hasText: "Trasferta" }).first()).toContainText("si modifica dalla trasferta");

    const summary = page.getByRole("region", { name: /Riepilogo delle spese/ });
    const categories = summary.getByRole("region", { name: "Spese per categoria" });
    for (const category of ["Palestre", "Attrezzatura sportiva", "Arbitri", "Trasferte", "Assicurazioni"]) {
      await expect(categories).toContainText(category);
    }
    // 4133 euro entered by hand + 205 euro of trips + 145 euro of referees
    await expect(summary.getByText(/^Spese 2026/).locator("../..")).toContainText(/€\s4483/);
  });

  test("una spesa nuova entra nel bilancio con la sua categoria, e una categoria già usata si riconosce anche scritta diversamente", async ({ page }) => {
    await loginAs(page, "admin", "/altro/spese");
    await page.getByRole("button", { name: "Nuova spesa" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuova spesa" });
    await form.getByLabel(/Nome della spesa/).fill("Gazebo per il torneo");
    await form.getByLabel(/Categoria/).fill("Eventi del club");
    await form.getByLabel(/Importo in euro/).fill("120");
    await form.getByLabel(/Fornitore/).fill("Brico Casa");
    await form.getByRole("button", { name: "Registra la spesa" }).click();
    await expect(page.getByText("Spesa registrata")).toBeVisible();

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
    await expect(list.getByRole("listitem").filter({ hasText: "Bandierine" })).toContainText("Eventi del club");

    await page.goto("/altro/bilancio");
    const expenses = page.getByRole("region", { name: "Uscite per categoria" });
    await expect(expenses.getByText("Eventi del club", { exact: true })).toHaveCount(1);
    await expect(expenses.getByText("Eventi del club", { exact: true }).locator("..")).toContainText(/€\s150/);
    await expect(page.getByRole("list", { name: "Movimenti", exact: true })).toContainText("Gazebo per il torneo");
  });
});
