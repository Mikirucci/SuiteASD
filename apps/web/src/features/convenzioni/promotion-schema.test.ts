import { describe, expect, it } from "vitest";
import { describeAudience, emptyPromotionForm, formValuesOf, promotionFormSchema, toCreateBody, toUpdateBody, type PromotionFormValues } from "./promotion-schema";
import { PROMOTION } from "./test-support";

const VALID: PromotionFormValues = { ...emptyPromotionForm(new Date(2026, 10, 21)), title: "Fisio", partnerName: "Therapia", allMembers: true };

describe("promotionFormSchema", () => {
  it("starts from today for a year, with the first template and nobody chosen", () => {
    expect(emptyPromotionForm(new Date(2026, 10, 21))).toMatchObject({
      template: "ELETTRICO",
      validFrom: "2026-11-21",
      validTo: "2027-11-21",
      allMembers: false,
      teamIds: [],
      roles: [],
    });
  });

  it("requires a title and a partner and limits the lengths", () => {
    expect(promotionFormSchema.safeParse(VALID).success).toBe(true);
    expect(promotionFormSchema.safeParse({ ...VALID, title: "  " }).success).toBe(false);
    expect(promotionFormSchema.safeParse({ ...VALID, partnerName: "" }).success).toBe(false);
    expect(promotionFormSchema.safeParse({ ...VALID, badge: "x".repeat(25) }).success).toBe(false);
    expect(promotionFormSchema.safeParse({ ...VALID, terms: "x".repeat(1001) }).success).toBe(false);
  });

  it("refuses an end before the start, on the end field", () => {
    const result = promotionFormSchema.safeParse({ ...VALID, validFrom: "2027-02-01", validTo: "2027-01-01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["validTo"]);
  });
});

describe("request bodies", () => {
  it("leaves out the optional texts that were left empty when creating", () => {
    expect(toCreateBody(VALID)).toEqual({
      title: "Fisio",
      partnerName: "Therapia",
      template: "ELETTRICO",
      validFrom: "2026-11-21",
      validTo: "2027-11-21",
      allMembers: true,
      teamIds: [],
      roles: [],
    });
    expect(toCreateBody({ ...VALID, badge: "Sconti", city: "Bitonto" })).toMatchObject({ badge: "Sconti", city: "Bitonto" });
  });

  it("clears an optional text that was emptied when updating", () => {
    const body = toUpdateBody({ ...formValuesOf(PROMOTION), badge: "", terms: "" });
    expect(body.badge).toBeNull();
    expect(body.terms).toBeNull();
    expect(body.partnerLabel).toBe("Medical partner");
    expect(body.teamIds).toEqual(["t16"]);
  });
});

describe("describeAudience", () => {
  const names = new Map([["t16", "Under 16"]]);

  it("says who receives it, in words", () => {
    expect(describeAudience({ allMembers: true, teamIds: [], roles: [] }, names)).toBe("Tutti i tesserati");
    expect(describeAudience({ allMembers: false, teamIds: ["t16"], roles: ["ALLENATORE", "STAFF"] }, names)).toBe("Under 16 · Allenatori · Staff");
    expect(describeAudience({ allMembers: false, teamIds: ["a", "b", "c"], roles: [] }, names)).toBe("3 squadre");
  });

  it("says when nobody is chosen yet", () => {
    expect(describeAudience({ allMembers: false, teamIds: [], roles: [] }, names)).toBe("Nessun destinatario");
  });
});
