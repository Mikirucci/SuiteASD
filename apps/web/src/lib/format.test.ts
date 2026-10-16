import { describe, expect, it } from "vitest";
import { centsToInput, formatDay, formatDayShort, formatEuro, parseEuroToCents, pluralize } from "./format";

describe("formatEuro", () => {
  it("drops the decimals for whole euros and groups from five digits, as Italian does", () => {
    expect(formatEuro(6000)).toBe("€\u00a060");
    expect(formatEuro(124000).replace(/\s/g, " ")).toBe("€ 1240");
    expect(formatEuro(1240000).replace(/\s/g, " ")).toBe("€ 12.400");
  });

  it("keeps two decimals otherwise", () => {
    expect(formatEuro(6050)).toBe("€\u00a060,50");
    expect(formatEuro(5)).toBe("€\u00a00,05");
  });
});

describe("parseEuroToCents", () => {
  it.each([
    ["60", 6000],
    ["60,5", 6050],
    ["60.5", 6050],
    ["1.250,00", 125000],
    ["€ 12,34", 1234],
    [" 0,01 ", 1],
  ])("reads %s as %i cents", (text, cents) => {
    expect(parseEuroToCents(text)).toBe(cents);
  });

  it.each(["", "abc", "0", "-5", "12,345", "60,5,1", "100001"])("rejects %s", (text) => {
    expect(parseEuroToCents(text)).toBeNull();
  });

  it("round-trips with centsToInput", () => {
    expect(centsToInput(6050)).toBe("60,5");
    expect(parseEuroToCents(centsToInput(6050))).toBe(6050);
    expect(centsToInput(6000)).toBe("60");
  });
});

describe("dates", () => {
  it("formats a calendar day without timezone shifts", () => {
    expect(formatDay("2026-11-10")).toBe("10 nov 2026");
    expect(formatDayShort("2026-11-01")).toBe("1 nov");
  });
});

describe("pluralize", () => {
  it("pluralizes counts", () => {
    expect(pluralize(1, "quota", "quote")).toBe("1 quota");
    expect(pluralize(3, "quota", "quote")).toBe("3 quote");
  });
});
