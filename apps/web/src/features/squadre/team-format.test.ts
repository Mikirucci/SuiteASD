import { describe, expect, it } from "vitest";
import { teamMeta } from "./team-format";

describe("teamMeta", () => {
  it("joins category and gender", () => {
    expect(teamMeta({ name: "Under 16", category: "U16", gender: "FEMALE" })).toBe("U16, Femminile");
  });

  it("leaves the category out when it repeats the name", () => {
    expect(teamMeta({ name: "Serie D", category: "Serie D", gender: "MIXED" })).toBe("Mista");
  });

  it("is empty when nothing is known", () => {
    expect(teamMeta({ name: "Open", category: null, gender: null })).toBe("");
  });
});
