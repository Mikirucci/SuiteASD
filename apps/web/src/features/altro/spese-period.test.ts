import { describe, expect, it } from "vitest";
import { toDayKey } from "@/lib/dates";
import {
  defaultRange,
  formatPeriod,
  formatRange,
  isDefaultRange,
  modeOf,
  parseRange,
  rangeOf,
  rangeQuery,
  rangeSearch,
  shiftRange,
  type DayRange,
} from "./spese-period";

const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);
const keys = (range: DayRange) => [toDayKey(range.from), toDayKey(range.to)];
const today = day(2026, 10, 24);

describe("rangeOf", () => {
  it("takes the week from Monday to Sunday that contains the day", () => {
    expect(keys(rangeOf("week", day(2026, 10, 24)))).toEqual(["2026-10-19", "2026-10-25"]);
    expect(keys(rangeOf("week", day(2026, 10, 19)))).toEqual(["2026-10-19", "2026-10-25"]);
    expect(keys(rangeOf("week", day(2026, 10, 25)))).toEqual(["2026-10-19", "2026-10-25"]);
  });

  it("takes the whole month, leap February included", () => {
    expect(keys(rangeOf("month", day(2026, 10, 24)))).toEqual(["2026-10-01", "2026-10-31"]);
    expect(keys(rangeOf("month", day(2028, 2, 10)))).toEqual(["2028-02-01", "2028-02-29"]);
  });

  it("takes the whole year", () => {
    expect(keys(rangeOf("year", day(2026, 10, 24)))).toEqual(["2026-01-01", "2026-12-31"]);
  });
});

describe("modeOf", () => {
  it("knows a whole week, month and year from any other stretch of days", () => {
    expect(modeOf(rangeOf("week", today))).toBe("week");
    expect(modeOf(rangeOf("month", today))).toBe("month");
    expect(modeOf(rangeOf("year", today))).toBe("year");
    expect(modeOf({ from: day(2026, 10, 5), to: day(2026, 10, 14) })).toBe("custom");
    // a week that is not Monday to Sunday is just a range
    expect(modeOf({ from: day(2026, 10, 20), to: day(2026, 10, 26) })).toBe("custom");
    expect(modeOf({ from: day(2026, 10, 5), to: day(2026, 10, 5) })).toBe("custom");
  });

  it("calls a range that happens to be a whole month a month, so the arrows move by months", () => {
    expect(modeOf({ from: day(2026, 3, 1), to: day(2026, 3, 31) })).toBe("month");
  });
});

describe("shiftRange", () => {
  it("moves a week by seven days, across the change of month and of year", () => {
    expect(keys(shiftRange(rangeOf("week", day(2026, 10, 24)), 1))).toEqual(["2026-10-26", "2026-11-01"]);
    expect(keys(shiftRange(rangeOf("week", day(2026, 1, 1)), -1))).toEqual(["2025-12-22", "2025-12-28"]);
  });

  it("moves a month by one, from January back to December and from December on to January", () => {
    expect(keys(shiftRange(rangeOf("month", day(2026, 1, 15)), -1))).toEqual(["2025-12-01", "2025-12-31"]);
    expect(keys(shiftRange(rangeOf("month", day(2026, 12, 15)), 1))).toEqual(["2027-01-01", "2027-01-31"]);
    expect(keys(shiftRange(rangeOf("month", day(2026, 3, 31)), -1))).toEqual(["2026-02-01", "2026-02-28"]);
  });

  it("moves a year by one", () => {
    expect(keys(shiftRange(rangeOf("year", day(2026, 6, 1)), -1))).toEqual(["2025-01-01", "2025-12-31"]);
  });

  it("moves a free range by its own length, so the arrows walk through the calendar without gaps or overlaps", () => {
    const ten = { from: day(2026, 10, 5), to: day(2026, 10, 14) };
    expect(keys(shiftRange(ten, 1))).toEqual(["2026-10-15", "2026-10-24"]);
    expect(keys(shiftRange(ten, -1))).toEqual(["2026-09-25", "2026-10-04"]);
    expect(keys(shiftRange({ from: day(2026, 10, 5), to: day(2026, 10, 5) }, 1))).toEqual(["2026-10-06", "2026-10-06"]);
  });

  it("keeps the length of a free range across the change of daylight time", () => {
    // the clocks go back on 25 October 2026: ten days from 20 October still end on 29 October
    expect(keys(shiftRange({ from: day(2026, 10, 20), to: day(2026, 10, 29) }, 1))).toEqual(["2026-10-30", "2026-11-08"]);
  });
});

describe("the default period", () => {
  it("is the current year", () => {
    expect(keys(defaultRange(today))).toEqual(["2026-01-01", "2026-12-31"]);
  });

  it("tells when there is nothing to reset", () => {
    expect(isDefaultRange(defaultRange(today), today)).toBe(true);
    expect(isDefaultRange({ from: day(2026, 1, 1), to: day(2026, 12, 31) }, today)).toBe(true);
    expect(isDefaultRange(rangeOf("month", today), today)).toBe(false);
    expect(isDefaultRange(shiftRange(defaultRange(today), -1), today)).toBe(false);
  });
});

describe("the period in the address", () => {
  it("reads the two days, and falls back to the default year when anything is missing, wrong or upside down", () => {
    expect(keys(parseRange("2026-10-05", "2026-10-14", today))).toEqual(["2026-10-05", "2026-10-14"]);
    expect(keys(parseRange("2026-10-05", "2026-10-05", today))).toEqual(["2026-10-05", "2026-10-05"]);
    for (const [from, to] of [
      [null, null],
      ["2026-10-05", null],
      ["ieri", "oggi"],
      ["2026-02-31", "2026-03-01"],
      ["2026-10-14", "2026-10-05"],
      ["2026-1-5", "2026-10-14"],
    ] as const) {
      expect(keys(parseRange(from, to, today)), `${from} ${to}`).toEqual(["2026-01-01", "2026-12-31"]);
    }
  });

  it("writes nothing for the default year, so the plain page keeps its plain address", () => {
    expect(rangeSearch(defaultRange(today), today)).toBe("");
    expect(rangeSearch(rangeOf("month", today), today)).toBe("dal=2026-10-01&al=2026-10-31");
    expect(keys(parseRange("2026-10-01", "2026-10-31", today))).toEqual(keys(rangeOf("month", today)));
  });
});

describe("rangeQuery", () => {
  it("writes the days as the API wants them", () => {
    expect(rangeQuery({ from: day(2026, 3, 2), to: day(2026, 3, 9) })).toEqual({ from: "2026-03-02", to: "2026-03-09" });
  });
});

describe("formatting", () => {
  it("writes a range in the shortest way that stays clear", () => {
    expect(formatRange({ from: day(2026, 10, 19), to: day(2026, 10, 25) })).toBe("19 – 25 ottobre 2026");
    expect(formatRange({ from: day(2026, 9, 28), to: day(2026, 10, 4) })).toBe("28 set – 4 ott 2026");
    expect(formatRange({ from: day(2026, 12, 28), to: day(2027, 1, 3) })).toBe("28 dic 2026 – 3 gen 2027");
    expect(formatRange({ from: day(2026, 10, 5), to: day(2026, 10, 5) })).toBe("5 ottobre 2026");
  });

  it("names a month with a capital and a year by its number", () => {
    expect(formatPeriod(rangeOf("month", today))).toBe("Ottobre 2026");
    expect(formatPeriod(rangeOf("year", today))).toBe("2026");
    expect(formatPeriod(rangeOf("week", today))).toBe("19 – 25 ottobre 2026");
    expect(formatPeriod({ from: day(2026, 10, 5), to: day(2026, 10, 14) })).toBe("5 – 14 ottobre 2026");
  });
});
