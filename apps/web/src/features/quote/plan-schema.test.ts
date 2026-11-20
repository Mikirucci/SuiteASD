import { describe, expect, it } from "vitest";
import { monthlyDueDates, planSchema, toPlanBody, type PlanValues } from "./schemas";

const VALUES: PlanValues = {
  name: "Quota novembre",
  kind: "MONTHLY",
  amount: "60",
  teamId: "",
  installments: "1",
  firstDueDate: "2026-11-10",
  isActive: true,
};

describe("monthlyDueDates", () => {
  it("gives one date a month, on the same day", () => {
    expect(monthlyDueDates("2026-11-10", 3)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
  });

  it("falls back to the last day of a shorter month and keeps the original day afterwards", () => {
    expect(monthlyDueDates("2026-01-31", 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("is a single date for a single payment", () => {
    expect(monthlyDueDates("2026-11-10", 1)).toEqual(["2026-11-10"]);
  });
});

describe("toPlanBody", () => {
  it("bills every active member when no team is chosen", () => {
    expect(toPlanBody(VALUES, "create")).toEqual({
      name: "Quota novembre",
      kind: "MONTHLY",
      amountCents: 6000,
      teamIds: [],
      dueDates: ["2026-11-10"],
    });
  });

  it("sends only name, kind and state when updating", () => {
    expect(toPlanBody({ ...VALUES, isActive: false }, "update")).toEqual({ name: "Quota novembre", kind: "MONTHLY", isActive: false });
  });
});

describe("planSchema", () => {
  it("accepts from 1 to 36 installments", () => {
    expect(planSchema.safeParse({ ...VALUES, installments: "36" }).success).toBe(true);
    expect(planSchema.safeParse({ ...VALUES, installments: "0" }).success).toBe(false);
    expect(planSchema.safeParse({ ...VALUES, installments: "37" }).success).toBe(false);
    expect(planSchema.safeParse({ ...VALUES, installments: "" }).success).toBe(false);
  });
});
