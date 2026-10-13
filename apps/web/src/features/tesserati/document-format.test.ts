import { describe, expect, it } from "vitest";
import { validateDocumentFile } from "./document-file";
import {
  describeExpiry,
  formatDateOnly,
  formatFileSize,
  markStateOf,
  parseDateOnly,
  teamLabel,
} from "./document-format";
import { formValuesOf, memberFormSchema, toCreateBody, toUpdateBody, EMPTY_MEMBER_FORM } from "./member-schema";
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

  it("maps every document status to one of the three marks", () => {
    expect(markStateOf("OK")).toBe("ok");
    expect(markStateOf("EXPIRING")).toBe("expiring");
    expect(markStateOf("EXPIRED")).toBe("missing");
    expect(markStateOf("MISSING")).toBe("missing");
  });

  it("formats file sizes and team badges", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(245_760)).toBe("240 KB");
    expect(formatFileSize(2_621_440)).toBe("2,5 MB");
    expect(teamLabel({ name: "Prima squadra", category: "Serie D" })).toBe("Serie D");
    expect(teamLabel({ name: "Under 14", category: null })).toBe("Under 14");
  });
});

describe("validateDocumentFile", () => {
  it("accepts PDF and photos up to 5 MB", () => {
    expect(validateDocumentFile(new File(["x"], "c.pdf", { type: "application/pdf" }))).toBeNull();
    expect(validateDocumentFile(new File(["x"], "c.jpg", { type: "image/jpeg" }))).toBeNull();
  });

  it("explains why a file is refused", () => {
    expect(validateDocumentFile(new File(["x"], "c.docx", { type: "application/msword" }))).toMatch(/PDF/);
    expect(validateDocumentFile(new File([], "c.pdf", { type: "application/pdf" }))).toBe("Il file è vuoto.");
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "c.pdf", { type: "application/pdf" });
    expect(validateDocumentFile(big)).toMatch(/il massimo è 5,0 MB/);
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
