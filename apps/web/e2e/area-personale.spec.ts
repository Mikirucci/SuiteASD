import { expect, test, type Page } from "@playwright/test";
import { auditAccessibility } from "./support/axe";
import type { MeOptions } from "./support/route-api";
import {
  CERTIFICATE_TYPE,
  FORM_TYPE,
  SARA_CONTI,
  certificateOf,
  detailOf,
  mockBackend,
  pageOf,
} from "./support/tesserati-fixtures";
import type { MemberListItem } from "../src/features/tesserati/types";

const ATHLETE: MeOptions = {
  permissions: [
    "members:readOwn",
    "members:updateOwn",
    "documents:readOwn",
    "documents:uploadOwn",
    "payments:readOwn",
    "convocations:respond",
    "notifications:readOwn",
    "events:read",
    "teams:read",
  ],
  roles: ["ATLETA"],
  member: { id: SARA_CONTI.id, firstName: "Sara", lastName: "Conti" },
};

/** Lets enter animations (dialog, cascade) finish so the colour contrast check reads the final colours. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

/** Backend of the personal area for Sara: uploading the certificate renews it, like the real API does. */
async function saraBackend(page: Page) {
  let member: MemberListItem = SARA_CONTI;
  const recorded = await mockBackend(
    page,
    "athlete",
    ({ method, path }) => {
      switch (`${method} ${path}`) {
        case "GET /members/m-sara":
          return { body: detailOf(member) };
        case "GET /members/m-sara/documents":
          return { body: pageOf([certificateOf(member.id)]) };
        case "GET /document-types":
          return { body: pageOf([CERTIFICATE_TYPE, FORM_TYPE]) };
        case "POST /members/m-sara/documents/upload":
          member = {
            ...member,
            documentStatus: "OK",
            documents: member.documents.map((indicator) =>
              indicator.key === "MEDICAL_CERTIFICATE" ? { ...indicator, status: "OK", daysRemaining: 365 } : indicator,
            ),
          };
          return { status: 201, body: certificateOf(member.id) };
        default:
          return undefined;
      }
    },
    ATHLETE,
  );
  return recorded;
}

test.describe("area personale", () => {
  test("an athlete who opens the administration is taken to the personal area", async ({ page }) => {
    await saraBackend(page);
    for (const route of ["/tesserati", "/scadenze", "/quote", "/calendario/presenze"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/area-personale$/);
    }
    const sections = page.getByRole("navigation", { name: "Sezioni", exact: true });
    await expect(sections.getByRole("link", { name: "Documenti" })).toBeVisible();
    await expect(sections.getByRole("link", { name: "Tesserati" })).toHaveCount(0);
  });

  test("shows the documents of the athlete with their state, without accessibility violations", async ({ page }) => {
    await saraBackend(page);
    await page.goto("/area-personale/documenti");

    await expect(page.getByRole("heading", { level: 1, name: /Carica una volta/ })).toBeVisible();
    const list = page.getByRole("list", { name: "Documenti richiesti" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    const certificate = list.getByRole("listitem").filter({ hasText: "Certificato medico" });
    await expect(certificate).toContainText("Scade il");
    await expect(certificate.getByRole("button", { name: "Scarica Certificato medico" })).toBeVisible();

    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("uploads a new certificate and the document turns up to date", async ({ page }) => {
    const recorded = await saraBackend(page);
    await page.goto("/area-personale/documenti");
    await expect(page.getByText("1 in scadenza: Certificato medico")).toBeVisible();

    await page.getByRole("button", { name: "Carica la nuova versione di Certificato medico" }).click();
    const dialog = page.getByRole("dialog", { name: /Carica un documento · Sara Conti/ });
    await dialog.getByLabel("Data di scadenza").fill("2030-01-31");
    await dialog.getByLabel(/^File/).setInputFiles({
      name: "certificato.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 certificato"),
    });
    await settle(page);
    expect(await auditAccessibility(page)).toEqual([]);

    await dialog.getByRole("button", { name: "Carica il documento" }).click();
    await expect(page.getByText("Documento caricato")).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(recorded.calls).toContain("POST /members/m-sara/documents/upload");
    await expect(page.getByText("1 in scadenza: Certificato medico")).toHaveCount(0);
    await expect(page.getByText("In regola").first()).toBeVisible();
  });

  test("asks for the expiry date and for the file before sending anything", async ({ page }) => {
    const recorded = await saraBackend(page);
    await page.goto("/area-personale/documenti");

    await page.getByRole("button", { name: "Carica la nuova versione di Certificato medico" }).click();
    const dialog = page.getByRole("dialog", { name: /Carica un documento · Sara Conti/ });
    await dialog.getByRole("button", { name: "Carica il documento" }).click();
    await expect(dialog.getByText("Scegli il file da caricare.")).toBeVisible();
    expect(recorded.calls).not.toContain("POST /members/m-sara/documents/upload");
  });

  test("fits a 320px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await saraBackend(page);
    await page.goto("/area-personale/documenti");
    await expect(page.getByRole("list", { name: "Documenti richiesti" }).getByRole("listitem")).toHaveCount(3);
    await settle(page);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await auditAccessibility(page)).toEqual([]);

    const bar = page.getByRole("navigation", { name: "Navigazione principale" });
    for (const link of await bar.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
