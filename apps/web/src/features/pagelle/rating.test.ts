import { describe, expect, it } from "vitest";
import { parseRating, ratingToInput } from "./rating";

describe("parseRating", () => {
  it.each([
    ["8,5", 8.5],
    ["8.5", 8.5],
    ["10", 10],
    ["1", 1],
    [" 7 ", 7],
    ["09,5", 9.5],
  ])("accepts %s", (input, expected) => {
    expect(parseRating(input)).toBe(expected);
  });

  it.each(["", "0", "0,5", "10,5", "11", "8,55", "otto", "8,", "-3"])("rejects %j", (input) => {
    expect(parseRating(input)).toBeNull();
  });

  it("writes ratings with the decimal comma", () => {
    expect(ratingToInput(8.5)).toBe("8,5");
    expect(ratingToInput(9)).toBe("9");
  });
});
