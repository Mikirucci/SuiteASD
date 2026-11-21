import { describe, expect, it } from "vitest";
import { describeSlot, formatDuration, parseSlots, serializeSlots, slotMinutes, slotsProblem, sortSlots } from "./venue-slots";

const TUESDAY = { weekday: 2, from: "18:00", to: "19:00" };

describe("parseSlots", () => {
  it("reads the rows of a form value, and takes anything else for no rows", () => {
    expect(parseSlots(serializeSlots([TUESDAY]))).toEqual([TUESDAY]);
    expect(parseSlots("[]")).toEqual([]);
    for (const wrong of ["", "not json", "{}", '[{"weekday":9,"from":"18:00","to":"19:00"}]', '[{"day":1}]']) expect(parseSlots(wrong)).toEqual([]);
  });

  it("keeps a row whose time is still being typed, so it does not vanish under the hand", () => {
    expect(parseSlots('[{"weekday":2,"from":"18:00","to":""}]')).toEqual([{ weekday: 2, from: "18:00", to: "" }]);
  });
});

describe("slotsProblem", () => {
  it("accepts no hours, and hours that end after they start", () => {
    expect(slotsProblem([])).toBeNull();
    expect(slotsProblem([TUESDAY, { weekday: 3, from: "18:00", to: "19:00" }])).toBeNull();
  });

  it("accepts a window that starts when the one before it ends, and the same hours on another day", () => {
    expect(slotsProblem([TUESDAY, { weekday: 2, from: "19:00", to: "20:00" }])).toBeNull();
  });

  it("asks for both times of every row", () => {
    expect(slotsProblem([{ weekday: 2, from: "18:00", to: "" }])).toMatch(/inizio e quella di fine/);
    expect(slotsProblem([{ weekday: 2, from: "6:00", to: "19:00" }])).toMatch(/inizio e quella di fine/);
  });

  it("refuses an end that is not after the start, and two windows of a day that overlap, in any order", () => {
    expect(slotsProblem([{ weekday: 2, from: "19:00", to: "18:00" }])).toMatch(/la fine deve essere dopo l'inizio/);
    expect(slotsProblem([{ weekday: 2, from: "18:00", to: "18:00" }])).toMatch(/la fine deve essere dopo l'inizio/);
    expect(slotsProblem([{ weekday: 2, from: "18:30", to: "20:00" }, TUESDAY])).toMatch(/non possono sovrapporsi/);
  });
});

describe("the way slots read", () => {
  it("orders them by day and then by time, without changing what it was given", () => {
    const given = [{ weekday: 4, from: "20:00", to: "21:00" }, { weekday: 2, from: "19:00", to: "20:00" }, TUESDAY];
    expect(sortSlots(given).map(describeSlot)).toEqual(["Martedì 18:00–19:00", "Martedì 19:00–20:00", "Giovedì 20:00–21:00"]);
    expect(given[0]?.weekday).toBe(4);
  });

  it("measures a window in minutes and writes hours the way a person says them", () => {
    expect(slotMinutes({ weekday: 2, from: "18:30", to: "22:00" })).toBe(210);
    expect([0, 45, 60, 270, 1650].map(formatDuration)).toEqual(["0 min", "45 min", "1 h", "4 h 30 min", "27 h 30 min"]);
  });
});
