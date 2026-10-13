import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  combineLocal,
  confirmedText,
  describeCalendarError,
  formatDayTitle,
  formatPercent,
  formatWhen,
  isOpen,
  matchEyebrow,
  toDateInput,
  toTimeInput,
  weekLabel,
  weekRange,
} from "./format";
import { MATCH_EVENT, TEAM_SERIE_D, at, makeEvent } from "./test-fixtures";

describe("week helpers", () => {
  it("covers Monday 00:00 to the next Monday 00:00 in local time", () => {
    const { from, to } = weekRange(new Date(2026, 10, 14, 15, 0));
    expect(new Date(from)).toEqual(new Date(2026, 10, 9, 0, 0));
    expect(new Date(to)).toEqual(new Date(2026, 10, 16, 0, 0));
  });

  it("writes the week as a range, with both months when it crosses one", () => {
    expect(weekLabel(new Date(2026, 10, 12))).toBe("9 – 15 novembre 2026");
    expect(weekLabel(new Date(2026, 10, 30))).toBe("30 novembre – 6 dicembre 2026");
  });

  it("capitalizes the day title", () => {
    expect(formatDayTitle(new Date(2026, 10, 14))).toBe("Sabato 14 novembre");
  });
});

describe("local date and time fields", () => {
  it("round-trips a local day and time through an ISO instant", () => {
    const iso = combineLocal("2026-11-14", "20:30");
    expect(iso).toBe(at(11, 14, 20, 30));
    expect(toDateInput(iso)).toBe("2026-11-14");
    expect(toTimeInput(iso)).toBe("20:30");
  });
});

describe("event lines", () => {
  it("writes day, time range and venue", () => {
    expect(formatWhen(MATCH_EVENT)).toBe("Sabato 14 novembre · 20:30–22:30 · Palazzetto");
    expect(formatWhen(makeEvent({ startsAt: at(11, 13, 18, 0) }))).toBe("Venerdì 13 novembre · 18:00");
  });

  it("builds the match eyebrow from the competition, or falls back to the team", () => {
    expect(matchEyebrow(MATCH_EVENT, { competition: "Serie D", group: "Girone B", round: 6 })).toBe("Serie D · Girone B · Giornata 6");
    expect(matchEyebrow(MATCH_EVENT, { competition: "Serie D", group: "Girone B", round: null })).toBe("Serie D · Girone B");
    expect(matchEyebrow(MATCH_EVENT, undefined)).toBe(TEAM_SERIE_D.name);
    expect(matchEyebrow({ team: null }, undefined)).toBe("Partita");
  });

  it("writes the confirmed count as in the product video", () => {
    expect(confirmedText({ confirmed: 5, capacity: 12 })).toBe("5/12 confermate");
  });

  it("formats percentages with at most one decimal, and a dash when nothing is recorded", () => {
    expect(formatPercent(87.5)).toBe("87,5%");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(null)).toBe("–");
  });
});

describe("isOpen", () => {
  const now = new Date(2026, 10, 12, 10, 0);
  it("is true only for a future event that is not cancelled", () => {
    expect(isOpen(MATCH_EVENT, now)).toBe(true);
    expect(isOpen({ ...MATCH_EVENT, status: "CANCELLED" }, now)).toBe(false);
    expect(isOpen({ ...MATCH_EVENT, startsAt: at(11, 11, 20, 30) }, now)).toBe(false);
  });
});

describe("describeCalendarError", () => {
  const problem = (status: number, code: string) => new ApiError(status, { type: "about:blank", title: "Error", status, code });

  it("explains the rules of the calendar in Italian", () => {
    expect(describeCalendarError(problem(409, "capacity_exceeded"))).toMatch(/posti per le convocazioni sono finiti/);
    expect(describeCalendarError(problem(422, "member_not_eligible"))).toMatch(/certificato medico scaduto/);
  });

  it("falls back to the generic wording by status", () => {
    expect(describeCalendarError(problem(500, "internal"))).toMatch(/non è disponibile/);
  });
});
