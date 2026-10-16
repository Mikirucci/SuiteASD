import { expect, test, type Page } from "@playwright/test";
import {
  ALL_AUTOMATIONS,
  READ_PERMISSIONS,
  WRITE_PERMISSIONS,
  makeDashboard,
  makeRun,
} from "../src/features/automazioni/test-fixtures";
import type { Automation, JsonObject } from "../src/features/automazioni/types";
import { auditAccessibility } from "./support/axe";
import { mockApi, seedStoredSession } from "./support/mock-api";
import { pageOf, routeApi, type ApiHandler } from "./support/route-api";

/** Lets enter animations (cascade, dialog, drawer) finish so the colour contrast check reads the final colours. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(700);
}

const problem = (status: number, code: string) => ({ status, body: { type: "about:blank", title: "Error", status, code } });

/** Backend of the module: switching on/off and saving settings change what the dashboard returns next. */
function automationsBackend() {
  const state = { automations: ALL_AUTOMATIONS.map((automation) => ({ ...automation })), dashboardFailures: 0 };
  const find = (path: string): Automation | undefined => state.automations.find((automation) => path.startsWith(`/automations/${automation.key}`));

  const handler: ApiHandler = ({ method, path, body }) => {
    if (method === "GET" && path === "/automations") {
      if (state.dashboardFailures > 0) {
        state.dashboardFailures -= 1;
        return problem(500, "internal");
      }
      return { body: makeDashboard(state.automations) };
    }
    const automation = find(path);
    if (!automation) return undefined;
    const patch = body as { enabled?: boolean; config?: JsonObject } | null;
    if (method === "PATCH") {
      if (patch?.enabled !== undefined) {
        automation.enabled = patch.enabled;
        automation.state = patch.enabled ? "COMPLETED" : "DISABLED";
      }
      if (patch?.config) automation.config = { ...automation.config, ...patch.config };
      return { body: automation };
    }
    if (method === "GET" && path.endsWith("/runs")) {
      return pageOf(
        automation.key === "fee-reminders"
          ? [
              makeRun(),
              makeRun({ id: "run-manual", runKey: "manual:2026-11-11T10:00:00.000Z", startedAt: "2026-11-11T10:00:00.000Z", finishedAt: "2026-11-11T10:00:01.000Z" }),
            ]
          : [],
      );
    }
    if (method === "POST" && path.endsWith("/run")) {
      return { body: makeRun({ id: "run-now", runKey: "manual:2026-11-12T10:00:00.000Z" }) };
    }
    return undefined;
  };
  return { state, handler };
}

async function openAs(page: Page, permissions: string[], backend = automationsBackend()) {
  await mockApi(page);
  const api = await routeApi(page, { permissions, roles: ["ADMIN"] }, backend.handler);
  await seedStoredSession(page);
  await page.goto("/automazioni");
  return { api, backend };
}

const rowOf = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name }) });

test.describe("gestione delegata, amministratore", () => {
  test("shows the share of delegated activities and the checklist, without accessibility violations", async ({ page }) => {
    await openAs(page, WRITE_PERMISSIONS);

    await expect(page.getByRole("heading", { level: 1, name: /Tu pensi alla squadra/ })).toBeVisible();
    await expect(page.getByText("9 su 10 attive · 90%")).toBeVisible();
    const checklist = page.getByRole("list", { name: "Checklist delle attività" });
    await expect(checklist.getByRole("heading", { level: 3 })).toHaveCount(10);
    await expect(rowOf(page, "Ricordare le quote")).toContainText("Completata");
    await expect(rowOf(page, "Ricordare le quote")).toContainText("Ogni giorno alle 09:00");
    await expect(rowOf(page, "Controllare i certificati")).toContainText("Errore");
    await expect(rowOf(page, "Inviare le convocazioni")).toContainText("Disattivata");
    await expect(rowOf(page, "Avvisare atleti e genitori")).toContainText("In corso");
    await expect(rowOf(page, "Aggiornare le classifiche")).toContainText("Sempre attiva");
    await expect(page.getByText("Automatico", { exact: true })).toHaveCount(9);

    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("switches an automation on and the percentage follows", async ({ page }) => {
    const { api } = await openAs(page, WRITE_PERMISSIONS);
    await expect(page.getByText("9 su 10 attive · 90%")).toBeVisible();

    await page.getByRole("switch", { name: "Attiva Inviare le convocazioni" }).check();
    await expect(page.getByText("Attività attivata")).toBeVisible();
    await expect(page.getByText("10 su 10 attive · 100%")).toBeVisible();
    expect(api.bodies.get("PATCH /automations/convocation-dispatch")).toEqual({ enabled: true });
    await expect(rowOf(page, "Inviare le convocazioni")).toContainText("Completata");

    await page.getByRole("switch", { name: "Attiva Ricordare le quote" }).uncheck();
    await expect(page.getByText("9 su 10 attive · 90%")).toBeVisible();
    await expect(rowOf(page, "Ricordare le quote")).toContainText("Disattivata");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("edits the thresholds of an automation", async ({ page }) => {
    const { api } = await openAs(page, WRITE_PERMISSIONS);
    await rowOf(page, "Ricordare le quote").getByRole("button", { name: /Impostazioni/ }).click();

    const dialog = page.getByRole("dialog", { name: "Impostazioni: Ricordare le quote" });
    await expect(dialog.getByLabel("Promemoria prima della scadenza")).toHaveValue("1, 7");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByLabel("Promemoria prima della scadenza").fill("0");
    await dialog.getByRole("button", { name: "Salva le impostazioni" }).click();
    await expect(dialog.getByText("Ogni valore va da 1 a 60")).toBeVisible();

    await dialog.getByLabel("Promemoria prima della scadenza").fill("2, 5, 14");
    await dialog.getByRole("button", { name: "Salva le impostazioni" }).click();
    await expect(page.getByText("Impostazioni salvate")).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(api.bodies.get("PATCH /automations/fee-reminders")).toEqual({
      config: { hour: 9, channels: ["IN_APP", "EMAIL"], beforeDueDays: [2, 5, 14], afterDueDays: [3, 10] },
    });
    await expect(rowOf(page, "Ricordare le quote")).toContainText("Promemoria: 2, 5 e 14 giorni prima della scadenza");
  });

  test("runs an automation now and reads the execution log", async ({ page }) => {
    const { api } = await openAs(page, WRITE_PERMISSIONS);
    await rowOf(page, "Ricordare le quote").getByRole("button", { name: /Esegui ora/ }).click();
    await expect(page.getByText("Esecuzione completata")).toBeVisible();
    await expect(page.getByText("Quote controllate: 12 · Promemoria inviati: 3")).toBeVisible();
    expect(api.calls).toContain("POST /automations/fee-reminders/run");

    await rowOf(page, "Ricordare le quote").getByRole("button", { name: /Registro/ }).click();
    const drawer = page.getByRole("dialog", { name: "Registro delle esecuzioni" });
    const runs = drawer.getByRole("list", { name: "Esecuzioni di Ricordare le quote" });
    await expect(runs.getByRole("listitem").filter({ hasText: "Manuale" })).toHaveCount(1);
    await expect(runs).toContainText("Quote controllate: 12");
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.keyboard.press("Escape");
    await rowOf(page, "Aggiornare le classifiche").getByRole("button", { name: /Registro/ }).click();
    await expect(page.getByRole("heading", { name: "Nessuna esecuzione registrata" })).toBeVisible();
  });
});

test.describe("gestione delegata, segreteria", () => {
  test("sees state and log but has no controls to change anything", async ({ page }) => {
    await openAs(page, READ_PERMISSIONS);
    await expect(page.getByText("9 su 10 attive · 90%")).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Impostazioni|Esegui ora/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Registro/ })).toHaveCount(10);
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});

test.describe("gestione delegata, errori", () => {
  test("a failed load shows an error and retrying recovers", async ({ page }) => {
    const backend = automationsBackend();
    backend.state.dashboardFailures = 3; // first attempt plus the two automatic retries
    await openAs(page, WRITE_PERMISSIONS, backend);

    const error = page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" });
    await expect(error).toBeVisible();
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByText("9 su 10 attive · 90%")).toBeVisible();
  });
});

test.describe("gestione delegata su telefono", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("fits a 320px screen, keeps targets at 44px and has no accessibility violations", async ({ page }) => {
    await openAs(page, WRITE_PERMISSIONS);
    await expect(page.getByText("9 su 10 attive · 90%")).toBeVisible();
    await settle(page);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    const row = rowOf(page, "Ricordare le quote");
    for (const name of [/Impostazioni/, /Esegui ora/, /Registro/]) {
      const box = await row.getByRole("button", { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await row.getByRole("button", { name: /Registro/ }).click();
    await expect(page.getByRole("dialog", { name: "Registro delle esecuzioni" })).toBeVisible();
    await settle(page);
    const drawerOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(drawerOverflow).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
