import { describe, expect, it } from "vitest";
import {
  assignmentFormSchema,
  feeFormSchema,
  refereeFormSchema,
  toCreateAssignmentBody,
  toFeeBody,
  toRefereeBody,
  type RefereeFormValues,
} from "./schemas";

const EMPTY: RefereeFormValues = { firstName: "Marco", lastName: "Verdi", email: "", phone: "", qualification: "", notes: "" };

describe("referee form", () => {
  it("requires first and last name and a valid email when given", () => {
    const result = refereeFormSchema.safeParse({ ...EMPTY, firstName: " ", email: "marco" });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Scrivi il nome", "Inserisci un'email valida"]);
    expect(refereeFormSchema.safeParse(EMPTY).success).toBe(true);
  });

  it("omits empty optional fields on create and nulls them on update", () => {
    expect(toRefereeBody(EMPTY, "create")).toEqual({ firstName: "Marco", lastName: "Verdi" });
    expect(toRefereeBody(EMPTY, "update")).toEqual({
      firstName: "Marco",
      lastName: "Verdi",
      email: null,
      phone: null,
      qualification: null,
      notes: null,
    });
    expect(toRefereeBody({ ...EMPTY, qualification: "Arbitro regionale" }, "create").qualification).toBe("Arbitro regionale");
  });
});

describe("assignment form", () => {
  it("needs a referee and a match, the fee is optional", () => {
    expect(assignmentFormSchema.safeParse({ refereeId: "", matchId: "", fee: "" }).error?.issues.map((issue) => issue.message)).toEqual([
      "Scegli l'arbitro",
      "Scegli la partita",
    ]);
    expect(assignmentFormSchema.safeParse({ refereeId: "r1", matchId: "m1", fee: "" }).success).toBe(true);
    expect(assignmentFormSchema.safeParse({ refereeId: "r1", matchId: "m1", fee: "venti" }).success).toBe(false);
  });

  it("converts the fee to cents, or leaves it out", () => {
    expect(toCreateAssignmentBody({ refereeId: "r1", matchId: "m1", fee: "25,50" })).toEqual({ refereeId: "r1", matchId: "m1", feeCents: 2550 });
    expect(toCreateAssignmentBody({ refereeId: "r1", matchId: "m1", fee: "" })).toEqual({ refereeId: "r1", matchId: "m1" });
  });

  it("removes the fee with null when the field is emptied", () => {
    expect(feeFormSchema.safeParse({ fee: "0" }).success).toBe(false);
    expect(toFeeBody({ fee: "30" })).toEqual({ feeCents: 3000 });
    expect(toFeeBody({ fee: "" })).toEqual({ feeCents: null });
  });
});
