import { describe, expect, it } from "vitest";
import { formatWhen, pluralize } from "./format";

// Local-time constructors keep the expectations independent of the machine timezone
const NOW = new Date(2026, 10, 9, 18, 0);

describe("formatWhen", () => {
  it("says today and yesterday in words", () => {
    expect(formatWhen(new Date(2026, 10, 9, 8, 5).toISOString(), NOW)).toBe("Oggi, 08:05");
    expect(formatWhen(new Date(2026, 10, 8, 23, 30).toISOString(), NOW)).toBe("Ieri, 23:30");
  });

  it("writes the day for older notifications and adds the year only when it differs", () => {
    expect(formatWhen(new Date(2026, 9, 28, 14, 30).toISOString(), NOW)).toBe("28 ott, 14:30");
    expect(formatWhen(new Date(2025, 11, 31, 9, 0).toISOString(), NOW)).toBe("31 dic 2025, 09:00");
  });
});

describe("pluralize", () => {
  it("picks the singular only for exactly one", () => {
    expect(pluralize(1, "notifica", "notifiche")).toBe("notifica");
    expect(pluralize(0, "notifica", "notifiche")).toBe("notifiche");
    expect(pluralize(2, "notifica", "notifiche")).toBe("notifiche");
  });
});
