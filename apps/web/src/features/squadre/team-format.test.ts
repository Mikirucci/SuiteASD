import { describe, expect, it } from "vitest";
import { genderLabelOf, toneOfGender } from "./team-format";

describe("toneOfGender", () => {
  it("gives each gender its own colour and a neutral one to the rest", () => {
    const tiles = [toneOfGender("FEMALE"), toneOfGender("MALE"), toneOfGender("MIXED"), toneOfGender(null)].map((tone) => tone.tile);
    expect(new Set(tiles).size).toBe(4);
    expect(toneOfGender("anything")).toEqual(toneOfGender(null));
  });
});

describe("genderLabelOf", () => {
  it("writes the gender in Italian and says nothing when it is unknown", () => {
    expect(genderLabelOf({ gender: "FEMALE" })).toBe("Femminile");
    expect(genderLabelOf({ gender: "MIXED" })).toBe("Mista");
    expect(genderLabelOf({ gender: null })).toBeNull();
  });
});
