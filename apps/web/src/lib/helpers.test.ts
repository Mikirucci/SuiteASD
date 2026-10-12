import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/features/auth/safe-next";
import { avatarToneOf, AVATAR_TONES, initialsOf } from "./avatar";
import { cn } from "./cn";
import { addDays, isSameDay, startOfWeek, toDayKey } from "./dates";

describe("initialsOf", () => {
  it.each([
    ["Anna Ferri", "AF"],
    ["giulia rossi", "GR"],
    ["Maria Anna De Luca", "ML"],
    ["Pelè", "PE"],
    ["  ", "?"],
  ])("%s -> %s", (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe("avatarToneOf", () => {
  it("is deterministic and ignores case and surrounding spaces", () => {
    expect(avatarToneOf("Sara Conti")).toBe(avatarToneOf("  sara conti "));
  });

  it("always returns a known tone and spreads people across the palette", () => {
    const names = ["Anna Ferri", "Chiara Neri", "Elena Russo", "Giulia Rossi", "Marta Bianchi", "Sara Conti", "Laura Villa", "Paola Gatti"];
    const tones = names.map(avatarToneOf);
    for (const tone of tones) expect(AVATAR_TONES).toContain(tone);
    expect(new Set(tones).size).toBeGreaterThan(3);
  });
});

describe("dates", () => {
  it("starts the week on Monday", () => {
    expect(toDayKey(startOfWeek(new Date(2026, 10, 14)))).toBe("2026-11-09");
    expect(toDayKey(startOfWeek(new Date(2026, 10, 15)))).toBe("2026-11-09");
    expect(toDayKey(startOfWeek(new Date(2026, 10, 9)))).toBe("2026-11-09");
  });

  it("adds days across month boundaries and compares calendar days", () => {
    expect(toDayKey(addDays(new Date(2026, 10, 30), 1))).toBe("2026-12-01");
    expect(isSameDay(new Date(2026, 10, 14, 9), new Date(2026, 10, 14, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 10, 14), new Date(2026, 10, 15))).toBe(false);
  });
});

describe("cn", () => {
  it("lets the last conflicting Tailwind class win, including project tokens", () => {
    expect(cn("p-4", "p-6")).toBe("p-6");
    expect(cn("shadow-soft", "shadow-raised")).toBe("shadow-raised");
    expect(cn("text-sm", "text-fg-muted")).toBe("text-sm text-fg-muted");
    expect(cn("rounded-lg", "rounded-xl")).toBe("rounded-xl");
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/tesserati", "/tesserati"],
    ["/quote?mese=11", "/quote?mese=11"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
