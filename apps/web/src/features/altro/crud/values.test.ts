import { describe, expect, it } from "vitest";
import { bodyReader, fromLocalInput, parseAmount, toLocalInput } from "./values";

describe("parseAmount", () => {
  it("reads euros written the Italian way", () => {
    expect(parseAmount("60")).toBe(6000);
    expect(parseAmount("60,5")).toBe(6050);
    expect(parseAmount("60.50")).toBe(6050);
    expect(parseAmount("1.250,00")).toBe(125000);
    expect(parseAmount("1.500")).toBe(150000);
    expect(parseAmount("€ 0")).toBe(0);
  });

  it("rejects text, negatives, more than two decimals and amounts the API refuses", () => {
    for (const input of ["", "abc", "-5", "1,234", "10.000.000,01"]) expect(parseAmount(input)).toBeNull();
  });
});

describe("datetime-local conversion", () => {
  it("round-trips an instant through the local input value", () => {
    const iso = "2026-11-14T13:30:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput(iso)).toMatch(/^2026-11-14T\d{2}:30$/);
  });
});

describe("bodyReader", () => {
  const values = { name: "  Palestra  ", city: "", size: "42" };

  it("omits empty optional fields on create and sends null on update", () => {
    expect(bodyReader(values, "create").text("city")).toBeUndefined();
    expect(bodyReader(values, "update").text("city")).toBeNull();
    expect(bodyReader(values, "update").text("missing")).toBeNull();
  });

  it("trims text and converts numbers", () => {
    const read = bodyReader(values, "create");
    expect(read.raw("name")).toBe("Palestra");
    expect(read.integer("size")).toBe(42);
  });
});
