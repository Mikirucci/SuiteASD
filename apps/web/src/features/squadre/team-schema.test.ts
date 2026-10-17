import { describe, expect, it } from "vitest";
import { team } from "@/features/tesserati/test-support";
import {
  EMPTY_TEAM_FORM,
  formValuesOf,
  isTeamGender,
  teamFormSchema,
  toCreateBody,
  toUpdateBody,
} from "./team-schema";

describe("teamFormSchema", () => {
  it("requires a name and trims it", () => {
    expect(teamFormSchema.safeParse(EMPTY_TEAM_FORM).success).toBe(false);
    expect(teamFormSchema.parse({ ...EMPTY_TEAM_FORM, name: "  Under 16  " }).name).toBe("Under 16");
  });

  it("mirrors the API limits", () => {
    expect(teamFormSchema.safeParse({ ...EMPTY_TEAM_FORM, name: "x".repeat(81) }).success).toBe(false);
    expect(teamFormSchema.safeParse({ ...EMPTY_TEAM_FORM, name: "U16", category: "x".repeat(41) }).success).toBe(false);
    expect(teamFormSchema.safeParse({ ...EMPTY_TEAM_FORM, name: "U16", description: "x".repeat(501) }).success).toBe(false);
    expect(teamFormSchema.safeParse({ ...EMPTY_TEAM_FORM, name: "U16", gender: "OTHER" }).success).toBe(false);
  });
});

describe("team bodies", () => {
  it("leaves empty optional fields out of a creation", () => {
    expect(toCreateBody({ ...EMPTY_TEAM_FORM, name: "U16" })).toEqual({ name: "U16" });
    expect(toCreateBody({ name: "U16", category: "U16", gender: "FEMALE", description: "Martedì e giovedì" })).toEqual({
      name: "U16",
      category: "U16",
      gender: "FEMALE",
      description: "Martedì e giovedì",
    });
  });

  it("sends null for the fields cleared in an edit", () => {
    expect(toUpdateBody({ ...EMPTY_TEAM_FORM, name: "U16" })).toEqual({
      name: "U16",
      category: null,
      gender: null,
      description: null,
    });
  });

  it("starts the edit form from the team", () => {
    expect(formValuesOf({ ...team("t1", "Under 16", "U16"), description: "Martedì" })).toEqual({
      name: "Under 16",
      category: "U16",
      gender: "FEMALE",
      description: "Martedì",
    });
    expect(formValuesOf({ ...team("t2", "Open", null), gender: null })).toEqual({
      name: "Open",
      category: "",
      gender: "",
      description: "",
    });
  });

  it("recognises the genders of the API only", () => {
    expect(isTeamGender("MIXED")).toBe(true);
    expect(isTeamGender("OTHER")).toBe(false);
    expect(isTeamGender(null)).toBe(false);
  });
});
