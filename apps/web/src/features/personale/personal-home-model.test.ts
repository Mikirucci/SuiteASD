import { describe, expect, it } from "vitest";
import type { Convocation } from "@/features/calendario/types";
import { at, makeConvocation, makeEvent, SARA, TEAM_U16, TEAM_SERIE_D } from "@/features/calendario/test-fixtures";
import { indicator } from "@/features/tesserati/test-support";
import type { Subject } from "./subjects";
import type { Fee } from "@/features/quote/types";
import {
  AFTER_WEEK_SHOWN,
  answerState,
  buildAppointmentRows,
  feeSummary,
  homeWindow,
  nearestExpiry,
  splitByWeek,
  type SubjectProfile,
} from "./personal-home-model";

const SARA_SUBJECT: Subject = { memberId: "m-sara", name: "Sara Conti", isSelf: true };
const ANNA_SUBJECT: Subject = { memberId: "m-anna", name: "Anna Conti", isSelf: false };

function profile(subject: Subject, teamIds: string[], certificateExpired = false): SubjectProfile {
  return { subject, teamIds: new Set(teamIds), certificateExpired };
}

function convocationFor(eventId: string, status: Convocation["status"]): Convocation {
  const event = makeEvent({ id: eventId });
  return makeConvocation(SARA, status, {
    id: `cv-${eventId}`,
    event: { id: event.id, type: event.type, title: event.title, startsAt: event.startsAt, status: event.status },
  });
}

function fee(overrides: Partial<Fee> = {}): Fee {
  return {
    id: "fee-1",
    memberId: "m-sara",
    memberName: "Sara Conti",
    teams: [],
    feePlanId: null,
    description: "Quota novembre",
    amountCents: 6000,
    currency: "EUR",
    dueDate: "2026-11-10",
    status: "PENDING",
    paidAt: null,
    method: null,
    payerName: null,
    payerEmail: null,
    reference: null,
    reminderCount: 0,
    lastReminderAt: null,
    receipt: null,
    claimedAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("homeWindow", () => {
  it("runs from the start of today to the next Monday, then a few weeks further", () => {
    const window = homeWindow(new Date(2026, 10, 12, 10, 0));
    expect(window.from).toEqual(new Date(2026, 10, 12, 0, 0));
    expect(window.nextWeek).toEqual(new Date(2026, 10, 16, 0, 0));
    expect(window.to.getTime()).toBeGreaterThan(window.nextWeek.getTime() + 28 * 86_400_000);
  });

  it("ends the week on the very same day when today is Sunday", () => {
    const window = homeWindow(new Date(2026, 10, 15, 9, 0));
    expect(window.from).toEqual(new Date(2026, 10, 15, 0, 0));
    expect(window.nextWeek).toEqual(new Date(2026, 10, 16, 0, 0));
  });
});

describe("buildAppointmentRows", () => {
  const training = makeEvent({ id: "ev-training", type: "TRAINING", title: "Allenamento", startsAt: at(11, 12, 19), team: TEAM_U16 });
  const match = makeEvent({ id: "ev-match", type: "MATCH", title: "Partita", startsAt: at(11, 14, 20, 30), team: TEAM_U16 });
  const otherTeam = makeEvent({ id: "ev-other", title: "Serie D", startsAt: at(11, 13, 19), team: TEAM_SERIE_D });
  const meeting = makeEvent({ id: "ev-meeting", title: "Riunione", startsAt: at(11, 13, 18), team: null });

  it("keeps the events of the teams of the person and the ones of no team, in time order", () => {
    const rows = buildAppointmentRows([match, otherTeam, meeting, training], [], [profile(SARA_SUBJECT, ["t-u16"])]);
    expect(rows.map((row) => row.event.id)).toEqual(["ev-training", "ev-meeting", "ev-match"]);
  });

  it("ties each team event to the convocation of the person", () => {
    const rows = buildAppointmentRows([training], [convocationFor("ev-training", "CONFIRMED")], [profile(SARA_SUBJECT, ["t-u16"])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.convocation?.status).toBe("CONFIRMED");
    expect(rows[0]?.subject).toEqual(SARA_SUBJECT);
  });

  it("makes one row per person when several people of the user are in the team", () => {
    const rows = buildAppointmentRows(
      [training],
      [convocationFor("ev-training", "PENDING")],
      [profile(SARA_SUBJECT, ["t-u16"]), profile(ANNA_SUBJECT, ["t-u16"])],
    );
    expect(rows.map((row) => row.subject?.memberId)).toEqual(["m-sara", "m-anna"]);
    expect(rows[1]?.convocation).toBeNull();
  });

  it("makes one answer-less row for an event of no team that nobody was convocated to", () => {
    const rows = buildAppointmentRows([meeting], [], [profile(SARA_SUBJECT, ["t-u16"]), profile(ANNA_SUBJECT, [])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBeNull();
    expect(answerState(rows[0]!, new Date(2026, 10, 12, 10))).toBe("not-needed");
  });

  it("lets a person answer an event of no team she was convocated to by hand", () => {
    const rows = buildAppointmentRows([meeting], [convocationFor("ev-meeting", "PENDING")], [profile(SARA_SUBJECT, [])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toEqual(SARA_SUBJECT);
    expect(rows[0]?.convocation?.status).toBe("PENDING");
  });

  it("flags a team event without convocation only when the medical certificate is expired", () => {
    const expired = buildAppointmentRows([training], [], [profile(SARA_SUBJECT, ["t-u16"], true)]);
    expect(expired[0]?.notConvocable).toBe(true);
    const fine = buildAppointmentRows([training], [], [profile(SARA_SUBJECT, ["t-u16"], false)]);
    expect(fine[0]?.notConvocable).toBe(false);
  });
});

describe("splitByWeek", () => {
  it("separates this week from the following ones and shows only the first few after it", () => {
    const window = homeWindow(new Date(2026, 10, 12, 10, 0));
    const events = [
      makeEvent({ id: "today-morning", startsAt: at(11, 12, 8), team: null }),
      makeEvent({ id: "sunday", startsAt: at(11, 15, 23, 30), team: null }),
      ...Array.from({ length: 8 }, (_, index) => makeEvent({ id: `later-${index}`, startsAt: at(11, 16 + index, 18), team: null })),
    ];
    const rows = buildAppointmentRows(events, [], []);
    const { thisWeek, afterWeek } = splitByWeek(rows, window);
    expect(thisWeek.map((row) => row.event.id)).toEqual(["today-morning", "sunday"]);
    expect(afterWeek).toHaveLength(AFTER_WEEK_SHOWN);
    expect(afterWeek[0]?.event.id).toBe("later-0");
  });
});

describe("answerState", () => {
  const now = new Date(2026, 10, 12, 10, 0);
  const team = profile(SARA_SUBJECT, ["t-u16"]);

  function rowOf(startsAt: string, status: Convocation["status"] | null, eventStatus: "SCHEDULED" | "CANCELLED" = "SCHEDULED") {
    const event = makeEvent({ id: "ev", startsAt, team: TEAM_U16, status: eventStatus });
    return buildAppointmentRows([event], status ? [convocationFor("ev", status)] : [], [team])[0]!;
  }

  it("reads the answer of the person while the event is ahead", () => {
    expect(answerState(rowOf(at(11, 13, 18), "CONFIRMED"), now)).toBe("confirmed");
    expect(answerState(rowOf(at(11, 13, 18), "DECLINED"), now)).toBe("declined");
    expect(answerState(rowOf(at(11, 13, 18), "PENDING"), now)).toBe("pending");
  });

  it("calls missed an unanswered event that already started, and keeps the answers given", () => {
    expect(answerState(rowOf(at(11, 12, 8), "PENDING"), now)).toBe("missed");
    expect(answerState(rowOf(at(11, 12, 8), "CONFIRMED"), now)).toBe("confirmed");
  });

  it("puts a cancelled event before everything else", () => {
    expect(answerState(rowOf(at(11, 13, 18), "PENDING", "CANCELLED"), now)).toBe("cancelled");
  });

  it("says when a team event has no convocation", () => {
    expect(answerState(rowOf(at(11, 13, 18), null), now)).toBe("none");
  });
});

describe("nearestExpiry", () => {
  it("picks the document that expires first, ignoring the ones without a date or missing", () => {
    const found = nearestExpiry([
      indicator({ key: "A", name: "Privacy", status: "OK", expiresAt: "2027-03-01", daysRemaining: 139 }),
      indicator({ key: "B", name: "Certificato medico", status: "EXPIRING", expiresAt: "2026-11-27", daysRemaining: 15 }),
      indicator({ key: "C", name: "Modulo", status: "OK", expiresAt: null, daysRemaining: null }),
      indicator({ key: "D", name: "Foto", status: "MISSING", documentId: null }),
    ]);
    expect(found?.name).toBe("Certificato medico");
  });

  it("counts an expired document as the nearest one", () => {
    const found = nearestExpiry([
      indicator({ key: "A", name: "Certificato medico", status: "EXPIRED", expiresAt: "2026-11-01", daysRemaining: -11 }),
      indicator({ key: "B", name: "Privacy", status: "OK", expiresAt: "2026-12-01", daysRemaining: 19 }),
    ]);
    expect(found?.name).toBe("Certificato medico");
  });

  it("is null when no document has an expiry", () => {
    expect(nearestExpiry([indicator({ key: "A", name: "Modulo", status: "OK" })])).toBeNull();
  });
});

describe("feeSummary", () => {
  it("totals what is due, counts overdue and claimed, and finds the next due date of the pending ones", () => {
    const summary = feeSummary([
      fee({ id: "a", amountCents: 6000, dueDate: "2026-12-10" }),
      fee({ id: "b", amountCents: 4000, dueDate: "2026-11-10" }),
      fee({ id: "c", amountCents: 2500, dueDate: "2026-10-01", status: "OVERDUE", claimedAt: "2026-11-02T08:00:00.000Z" }),
      fee({ id: "d", status: "PAID", paidAt: "2026-10-05T08:00:00.000Z" }),
      fee({ id: "e", status: "CANCELLED" }),
    ]);
    expect(summary.dueCount).toBe(3);
    expect(summary.dueCents).toBe(12_500);
    expect(summary.overdueCount).toBe(1);
    expect(summary.claimedCount).toBe(1);
    expect(summary.next?.id).toBe("b");
  });

  it("has nothing to report when everything is paid", () => {
    const summary = feeSummary([fee({ status: "PAID" })]);
    expect(summary).toMatchObject({ dueCount: 0, dueCents: 0, overdueCount: 0, claimedCount: 0, next: null });
  });
});
