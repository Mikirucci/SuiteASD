import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import {
  CERTIFICATE_TYPE,
  FORM_TYPE,
  SARA_CONTI,
  TEAMS,
  certificateOf,
  demoMembers,
  detailOf,
  mockBackend,
  pageOf,
  problem,
} from "./support/tesserati-fixtures";
import type { MemberListItem } from "../src/features/tesserati/types";

const PAGE_SIZE = 25;

/** Members backend: list with filters and cursor, detail, documents, create, import and delete. */
async function membersBackend(page: Page) {
  const members = demoMembers();
  const recorded = await mockBackend(page, "admin", ({ method, path, query, body }) => {
    switch (`${method} ${path}`) {
      case "GET /members": {
        const q = (query.get("q") ?? "").toLowerCase();
        const teamId = query.get("teamId");
        const matching = members.filter(
          (item) =>
            (!q || `${item.firstName} ${item.lastName}`.toLowerCase().includes(q)) &&
            (!teamId || item.teams.some((team) => team.id === teamId)),
        );
        const offset = Number(query.get("cursor") ?? 0);
        const slice = matching.slice(offset, offset + PAGE_SIZE);
        const next = offset + PAGE_SIZE < matching.length ? String(offset + PAGE_SIZE) : null;
        return { body: pageOf(slice, next) };
      }
      case "GET /members/summary":
        return {
          body: {
            tesserati: members.length,
            squadre: TEAMS.length,
            documentiMancanti: members.filter((item) => item.documentStatus === "MISSING").length,
          },
        };
      case "GET /teams":
        return { body: pageOf(TEAMS) };
      case "GET /document-types":
        return { body: pageOf([CERTIFICATE_TYPE, FORM_TYPE]) };
      case "POST /members": {
        const input = body as { firstName: string; lastName: string };
        const created: MemberListItem = {
          ...SARA_CONTI,
          id: "m-nuova",
          firstName: input.firstName,
          lastName: input.lastName,
          teams: [],
        };
        members.push(created);
        return { status: 201, body: detailOf(created) };
      }
      case "POST /members/import": {
        const dryRun = (body as { dryRun: boolean }).dryRun;
        return {
          body: {
            dryRun,
            totalRows: 3,
            validRows: 2,
            invalidRows: 1,
            created: dryRun ? 0 : 2,
            ignoredColumns: [],
            errors: [{ row: 4, field: "teams", message: 'Unknown team "U99"' }],
          },
        };
      }
      case "PUT /documents/doc-certificate/file":
        return { body: certificateOf("m-sara") };
      case "DELETE /members/m-sara":
        return { status: 204 };
      default: {
        const memberMatch = /^\/members\/([^/]+)(\/documents)?$/.exec(path);
        const found = memberMatch ? members.find((item) => item.id === memberMatch[1]) : undefined;
        if (method === "GET" && memberMatch && found) {
          if (memberMatch[2])
            return { body: pageOf(found.documentStatus === "MISSING" ? [] : [certificateOf(found.id)]) };
          return { body: detailOf(found) };
        }
        return method === "GET" && memberMatch ? { status: 404, body: problem(404, "not_found") } : undefined;
      }
    }
  });
  return recorded;
}

test.describe("Tesserati (01)", () => {
  test("lists members with badges, indicators, pills and the summary bar", async ({ page }) => {
    await membersBackend(page);
    await page.goto("/tesserati");

    await expect(page.getByRole("heading", { level: 1, name: "Tutti i tesserati, in ordine." })).toBeVisible();
    const list = page.getByRole("list", { name: "Tesserati" });
    await expect(list.getByRole("listitem")).toHaveCount(PAGE_SIZE);

    const sara = list.getByRole("listitem").filter({ hasText: "Sara Conti" });
    await expect(sara.getByText("U16")).toBeVisible();
    await expect(sara.getByText("1 in scadenza: Certificato medico")).toBeVisible();
    const anna = list.getByRole("listitem").filter({ hasText: "Anna Ferri" });
    await expect(anna.getByText("1 documento mancante: Certificato medico")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: "In regola" }).first()).toBeVisible();

    const summary = page.getByRole("group", { name: "Riepilogo" });
    await expect(summary).toContainText("Tesserati");
    await expect(summary).toContainText("27");
    await expect(summary).toContainText("4");
    await expect(summary).toContainText("1documento mancante");
    const pills = page.getByRole("group", { name: "Filtra per squadra" }).getByRole("button");
    await expect(pills).toHaveText(["Tutte", "U14", "U16", "U18", "Serie D", "Senza squadra"]);

    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("loads the next page, filters by team and searches", async ({ page }) => {
    await membersBackend(page);
    await page.goto("/tesserati");
    const rows = page.getByRole("list", { name: "Tesserati" }).getByRole("listitem");
    await expect(rows).toHaveCount(PAGE_SIZE);

    await page.getByRole("button", { name: "Carica altri" }).click();
    await expect(rows).toHaveCount(27);
    await expect(page.getByRole("button", { name: "Carica altri" })).toHaveCount(0);

    await page.getByRole("group", { name: "Filtra per squadra" }).getByRole("button", { name: "Serie D" }).click();
    await expect(rows.filter({ hasText: "Giulia Rossi" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Sara Conti" })).toHaveCount(0);

    await page.getByRole("group", { name: "Filtra per squadra" }).getByRole("button", { name: "Tutte" }).click();
    await page.getByRole("searchbox", { name: "Cerca tesserato" }).fill("conti");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Sara Conti");

    await page.getByRole("searchbox", { name: "Cerca tesserato" }).fill("nessunosichiama");
    await expect(page.getByRole("heading", { name: "Nessun tesserato trovato" })).toBeVisible();
  });

  test("opens a member profile with data, guardians and documents", async ({ page }) => {
    await membersBackend(page);
    await page.goto("/tesserati");
    await page.getByRole("link", { name: /Sara Conti/ }).click();

    await expect(page).toHaveURL(/\/tesserati\/m-sara$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sara Conti" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Squadre" })).toContainText("U16");
    await expect(page.getByText("Madre")).toBeVisible();
    const documents = page.getByRole("list", { name: "Documenti del tesserato" });
    await expect(documents).toContainText("Certificato medico");
    await expect(documents).toContainText("certificato.pdf · 240 KB");
    await expect(page.getByRole("button", { name: "Apri Certificato medico" })).toBeVisible();
    await page.getByRole("button", { name: "Altre azioni di Certificato medico" }).click();
    await expect(page.getByRole("menuitem", { name: "Scarica Certificato medico" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Elimina Certificato medico" })).toBeVisible();
    await page.keyboard.press("Escape");

    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("uploads a PDF to a document", async ({ page }) => {
    const recorded = await membersBackend(page);
    await page.goto("/tesserati/m-sara");
    await expect(page.getByRole("list", { name: "Documenti del tesserato" })).toBeVisible();

    await page.getByLabel("File di Certificato medico", { exact: true }).setInputFiles({
      name: "certificato-2027.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 certificato"),
    });
    await expect.poll(() => recorded.calls).toContain("PUT /documents/doc-certificate/file");
  });

  test("creates a member from the dialog and lands on the new profile", async ({ page }) => {
    const recorded = await membersBackend(page);
    await page.goto("/tesserati");
    await page.getByRole("button", { name: "Nuovo tesserato" }).click();

    const dialog = page.getByRole("dialog", { name: "Nuovo tesserato" });
    await dialog.getByRole("button", { name: "Aggiungi tesserato" }).click();
    await expect(dialog.getByText("Inserisci il nome")).toBeVisible();

    await dialog.getByRole("textbox", { name: "Nome", exact: true }).fill("Linda");
    await dialog.getByRole("textbox", { name: "Cognome", exact: true }).fill("Pellegrini");
    await dialog.getByRole("checkbox", { name: "U18" }).check();
    await page.waitForTimeout(500);
    expect(await auditAccessibility(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Aggiungi tesserato" }).click();

    await expect(page).toHaveURL(/\/tesserati\/m-nuova$/);
    await expect(page.getByRole("heading", { level: 1, name: "Linda Pellegrini" })).toBeVisible();
    expect(recorded.bodies["POST /members"]).toMatchObject({
      firstName: "Linda",
      lastName: "Pellegrini",
      teamIds: ["team-3"],
    });
  });

  test("imports a CSV after checking it", async ({ page }) => {
    const recorded = await membersBackend(page);
    await page.goto("/tesserati");
    await page.getByRole("button", { name: "Altre azioni" }).click();
    await page.getByRole("menuitem", { name: "Importa CSV" }).click();
    const dialog = page.getByRole("dialog", { name: "Importa tesserati da CSV" });

    await dialog.getByLabel("File CSV").setInputFiles({
      name: "tesserati.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("nome;cognome;squadre\nSara;Conti;U16\nGiulia;Rossi;Serie D\nAnna;Ferri;U99\n"),
    });
    await expect(dialog.getByText("2 valide")).toBeVisible();
    await expect(dialog.getByText("La squadra «U99» non esiste")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByRole("button", { name: "Importa 2 tesserati" }).click();
    await expect(page.getByText("2 tesserati importati")).toBeVisible();
    expect(recorded.calls.filter((call) => call === "POST /members/import")).toHaveLength(2);
  });

  test("deletes a member after confirmation", async ({ page }) => {
    const recorded = await membersBackend(page);
    await page.goto("/tesserati/m-sara");
    await page.getByRole("button", { name: "Elimina", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Eliminare Sara Conti?" })
      .getByRole("button", { name: "Elimina tesserato" })
      .click();
    await expect(page).toHaveURL(/\/tesserati$/);
    expect(recorded.calls).toContain("DELETE /members/m-sara");
  });

  test("shows an error with retry when the list cannot be loaded", async ({ page }) => {
    let failing = true;
    await mockBackend(page, "admin", ({ method, path }) => {
      if (method === "GET" && path === "/members") {
        return failing
          ? { status: 500, body: problem(500, "internal_error") }
          : { body: pageOf(demoMembers().slice(0, 3)) };
      }
      if (method === "GET" && path === "/members/summary")
        return { body: { tesserati: 3, squadre: 4, documentiMancanti: 0 } };
      if (method === "GET" && path === "/teams") return { body: pageOf(TEAMS) };
      return undefined;
    });
    await page.goto("/tesserati");
    await expect(page.getByRole("alert").filter({ hasText: "Il servizio non è disponibile al momento" })).toBeVisible();
    failing = false;
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("list", { name: "Tesserati" }).getByRole("listitem")).toHaveCount(3);
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await membersBackend(page);
    await page.goto("/tesserati");
    await expect(page.getByRole("list", { name: "Tesserati" }).getByRole("listitem")).toHaveCount(PAGE_SIZE);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    await page.goto("/tesserati/m-sara");
    await expect(page.getByRole("heading", { level: 1, name: "Sara Conti" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
