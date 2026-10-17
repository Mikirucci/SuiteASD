import { describe, expect, it } from "vitest";
import {
  describeExpiry,
  formatDateOnly,
  expiringLabel,
  missingLabel,
  parseDateOnly,
  summarizeDocuments,
  teamLabel,
} from "./document-format";
import { formValuesOf, memberFormSchema, toCreateBody, toUpdateBody, EMPTY_MEMBER_FORM } from "./member-schema";
import type { DocumentIndicator } from "./types";
import { describeImportProblem } from "./import-messages";
import { SARA_CONTI, detailOf } from "./test-support";

describe("describeExpiry", () => {
  it.each([
    [15, "Scade tra 15 giorni"],
    [1, "Scade domani"],
    [0, "Scade oggi"],
    [-1, "Scaduto ieri"],
    [-3, "Scaduto da 3 giorni"],
  ])("%i -> %s", (days, text) => {
    expect(describeExpiry(days)).toBe(text);
  });
});

describe("dates and labels", () => {
  it("reads a date-only value as a local calendar day", () => {
    const date = parseDateOnly("2026-11-27");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 27]);
    expect(formatDateOnly("2026-11-27")).toBe("27 novembre 2026");
  });

  it("labels a team by its name, adding the category only when the name does not already say it", () => {
    expect(teamLabel({ name: "Rosa Under 16", category: "U16" })).toBe("Rosa Under 16 (U16)");
    expect(teamLabel({ name: "Prima squadra", category: "Serie D" })).toBe("Prima squadra (Serie D)");
    expect(teamLabel({ name: "Under 14", category: null })).toBe("Under 14");
    expect(teamLabel({ name: "U16", category: "U16" })).toBe("U16");
    expect(teamLabel({ name: "Serie D femminile", category: "serie d" })).toBe("Serie D femminile");
    expect(teamLabel({ name: "Under 14", category: "  " })).toBe("Under 14");
  });
});

describe("summarizeDocuments", () => {
  const indicator = (name: string, status: DocumentIndicator["status"]): DocumentIndicator => ({
    documentTypeId: name,
    key: name,
    name,
    status,
    documentId: null,
    expiresAt: null,
    daysRemaining: null,
  });

  it("counts missing and expired documents together, expiring ones apart", () => {
    const summary = summarizeDocuments([
      indicator("Certificato medico", "EXPIRED"),
      indicator("Privacy", "MISSING"),
      indicator("Iscrizione", "EXPIRING"),
      indicator("Assicurazione", "OK"),
    ]);
    expect(summary).toEqual({ missing: ["Certificato medico", "Privacy"], expiring: ["Iscrizione"] });
  });

  it("is empty when every document is in order", () => {
    expect(summarizeDocuments([indicator("Privacy", "OK")])).toEqual({ missing: [], expiring: [] });
  });

  it("words the counts in Italian", () => {
    expect(missingLabel(1)).toBe("1 documento mancante");
    expect(missingLabel(2)).toBe("2 documenti mancanti");
    expect(expiringLabel(3)).toBe("3 in scadenza");
  });
});

describe("member form conversion", () => {
  const filled = { ...EMPTY_MEMBER_FORM, firstName: "Sara", lastName: "Conti", fiscalCode: "cntsra09h41f205x" };

  it("leaves empty fields out of a creation and upper-cases the fiscal code", () => {
    const body = toCreateBody(filled);
    expect(body).toMatchObject({ firstName: "Sara", fiscalCode: "CNTSRA09H41F205X", status: "ACTIVE", teamIds: [] });
    expect(body.email).toBeUndefined();
    expect(body.gender).toBeUndefined();
  });

  it("clears empty fields with null on an update", () => {
    const body = toUpdateBody(filled);
    expect(body.email).toBeNull();
    expect(body.gender).toBeNull();
    expect(body.birthDate).toBeNull();
  });

  it("round-trips a member through the form", () => {
    const values = formValuesOf(detailOf(SARA_CONTI));
    expect(values).toMatchObject({ firstName: "Sara", teamIds: ["t16"], status: "ACTIVE", email: "" });
    expect(memberFormSchema.safeParse(values).success).toBe(true);
  });

  it("applies the same limits as the API", () => {
    expect(memberFormSchema.safeParse({ ...filled, fiscalCode: "ABC" }).success).toBe(false);
    expect(memberFormSchema.safeParse({ ...filled, email: "x" }).success).toBe(false);
    expect(memberFormSchema.safeParse({ ...filled, firstName: " " }).success).toBe(false);
    expect(memberFormSchema.safeParse({ ...filled, notes: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("describeImportProblem", () => {
  it("never shows the English message of the API", () => {
    expect(describeImportProblem("fiscalCode", "Duplicate fiscal code in the file")).toBe(
      "Codice fiscale ripetuto nel file",
    );
    expect(describeImportProblem("birthDate", "Invalid ISO date")).toBe("Valore non valido per «Data di nascita»");
    expect(describeImportProblem(null, "Something")).toBe("Riga non valida");
  });
});
