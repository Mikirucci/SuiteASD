import { expect, test } from "@playwright/test";
import { loginAs } from "./support/session";

// Read-only tour of the demo society (SPEC section 6) against the real API and the seeded database.
test.describe("società demo, in sola lettura", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("la home saluta e porta a tutti i moduli", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ciao");
    const sidebar = page.getByRole("navigation", { name: "Sezioni", exact: true });
    await expect(sidebar.getByRole("link", { name: "Home" })).toBeVisible();
    const topics = {
      Persone: ["Tesserati", "Squadre", "Staff", "Accessi e inviti"],
      "Attività sportiva": ["Calendario", "Presenze", "Classifiche", "Tornei", "Pagelle", "Arbitri", "Statistiche"],
      Amministrazione: ["Pagamenti", "Scadenze e documenti", "Bilancio", "Sponsor"],
      Logistica: ["Palestre", "Trasferte", "Divise"],
      Comunicazione: ["Notifiche", "Bacheca", "Automazioni"],
    };
    for (const [topic, labels] of Object.entries(topics)) {
      const group = sidebar.getByRole("button", { name: topic });
      if ((await group.getAttribute("aria-expanded")) === "false") await group.click();
      for (const label of labels) {
        await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
      }
    }
    await expect(sidebar.getByRole("link", { name: "Altro" })).toHaveCount(0);
  });

  test("tesserati: ricerca di Sara Conti e scheda con il certificato in scadenza", async ({ page }) => {
    await page.goto("/tesserati");
    await page.getByRole("searchbox", { name: "Cerca tesserato" }).fill("Sara Conti");
    const list = page.getByRole("list", { name: "Tesserati" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await list.getByRole("link", { name: /Sara Conti/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sara Conti" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Documenti del tesserato" })).toContainText("Certificato medico");
  });

  test("scadenze: il certificato di Sara Conti scade tra 15 giorni", async ({ page }) => {
    await page.goto("/scadenze");
    await expect(page.getByText("Sara Conti · Certificato medico — Scade tra 15 giorni")).toBeVisible();
  });

  test("classifiche: Girone B di Serie D con Aquile Volley prima a 32 punti", async ({ page }) => {
    await page.goto("/classifiche");
    const rows = page.getByRole("row").filter({ hasNot: page.getByRole("columnheader") });
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("Aquile Volley");
    await expect(rows.nth(0)).toContainText("32");
    await expect(rows.nth(1)).toContainText("Falchi Volley");
    await expect(rows.nth(2)).toContainText("Delfini Volley");
    await expect(rows.nth(3)).toContainText("Leoni Volley");
    await expect(rows.nth(4)).toContainText("Tigri Volley");
  });

  test("quote: incassati 240 euro, da incassare il resto, senza conteggi sotto le cifre", async ({ page }) => {
    await page.goto("/quote");
    const report = page.getByRole("region", { name: "Rendiconto" });
    await expect(report.getByText("Incassato", { exact: true }).locator("../..")).toContainText(/€\s240/);
    await expect(report.getByText("Da incassare", { exact: true }).locator("../..")).toContainText(/€\s6900/);
    await expect(report).not.toContainText(/quote pagate|di cui/);
  });

  test("calendario: la partita Aquile-Delfini del 14 novembre con 5/12 confermate", async ({ page }) => {
    await page.goto("/calendario");
    // The week strip starts from the current week: walk forward to the week of the match.
    const next = page.getByRole("button", { name: "Settimana successiva" });
    const saturday = page.getByRole("button", { name: /14 novembre/ });
    for (let week = 0; week < 8 && !(await saturday.isVisible()); week += 1) await next.click();
    await saturday.click();
    await expect(page.getByText("Aquile Volley vs Delfini Volley").first()).toBeVisible();
    await expect(page.getByText("SERIE D · GIRONE B · GIORNATA 6")).toBeVisible();
    await expect(page.getByText("20:30").first()).toBeVisible();
    await expect(page.getByText(/5\/12\s+confermate/)).toBeVisible();
  });

  test("automazioni: 10 attività su 10 attive, 100%", async ({ page }) => {
    await page.goto("/automazioni");
    await expect(page.getByText("10 su 10 attive · 100%")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inviare le convocazioni" })).toBeVisible();
  });

  test("altro: le sezioni secondarie hanno dati dal seed", async ({ page }) => {
    for (const path of ["/altro/palestre", "/altro/sponsor", "/altro/bilancio", "/altro/bacheca", "/altro/arbitri", "/altro/statistiche"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveCount(0);
    }
  });
});
