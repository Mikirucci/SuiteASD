import type {
  AttendanceSheet,
  CalendarEvent,
  Convocation,
  ConvocationStatus,
  EventConvocations,
  MemberRef,
  RosterMember,
  TeamAttendanceSummary,
} from "./types";

/** Fixtures of the calendar tests (never imported by product code). Dates are local, like the browser the UI runs in. */

/** Thursday 12 November 2026, 10:00: the "now" the page tests freeze. */
export const NOW = new Date(2026, 10, 12, 10, 0);

/** ISO instant of a local date and time; `month` is 1-12. */
export function at(month: number, day: number, hour = 0, minute = 0): string {
  return new Date(2026, month - 1, day, hour, minute).toISOString();
}

export const COACH_PERMISSIONS = [
  "events:read",
  "events:write",
  "convocations:readOwn",
  "convocations:read",
  "convocations:write",
  "attendance:read",
  "attendance:write",
  "teams:read",
  "venues:read",
  "competitions:read",
  "members:read",
];
export const SECRETARY_PERMISSIONS = ["events:read", "events:write", "convocations:readOwn", "convocations:read", "attendance:read", "teams:read", "venues:read", "competitions:read"];
export const ATHLETE_PERMISSIONS = ["events:read", "convocations:readOwn", "convocations:respond", "teams:read", "venues:read", "competitions:read"];

export const TEAM_SERIE_D = { id: "t-sd", name: "Serie D" };
export const TEAM_U16 = { id: "t-u16", name: "U16" };
export const PALAZZETTO = { id: "v-palazzetto", name: "Palazzetto", address: "Via dello Sport 1, Roma" };
export const PALESTRA = { id: "v-palestra", name: "Palestra comunale", address: null };

export function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev-1",
    type: "MEETING",
    title: "Riunione dei genitori",
    startsAt: at(11, 13, 18, 0),
    endsAt: null,
    status: "SCHEDULED",
    notes: null,
    team: null,
    venue: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    convocations: { confirmed: 0, declined: 0, pending: 0, total: 0, capacity: 12 },
    convocationsSentAt: null,
    createdAt: at(10, 1, 8),
    updatedAt: at(10, 1, 8),
    ...overrides,
  };
}

/** Aquile Volley vs Delfini Volley, Saturday 14 November 20:30, Palazzetto. */
export const MATCH_EVENT = makeEvent({
  id: "ev-match",
  type: "MATCH",
  title: "Aquile Volley vs Delfini Volley",
  startsAt: at(11, 14, 20, 30),
  endsAt: at(11, 14, 22, 30),
  team: TEAM_SERIE_D,
  venue: PALAZZETTO,
  convocations: { confirmed: 5, declined: 1, pending: 2, total: 8, capacity: 12 },
  convocationsSentAt: at(11, 9, 8, 0),
});

/** Thursday 12 November 19:00-20:30, today in the frozen clock. */
export const TRAINING_EVENT = makeEvent({
  id: "ev-training",
  type: "TRAINING",
  title: "Allenamento",
  startsAt: at(11, 12, 19, 0),
  endsAt: at(11, 12, 20, 30),
  team: TEAM_SERIE_D,
  venue: PALESTRA,
  recurrenceRule: "FREQ=WEEKLY;COUNT=10",
});

/** A training of the previous week: the one the check-in opens on. */
export const PAST_TRAINING = makeEvent({
  id: "ev-past",
  type: "TRAINING",
  title: "Allenamento",
  startsAt: at(11, 5, 19, 0),
  endsAt: at(11, 5, 20, 30),
  team: TEAM_SERIE_D,
  venue: PALESTRA,
});

export const WEEK_EVENTS: CalendarEvent[] = [TRAINING_EVENT, MATCH_EVENT];

export function member(id: string, firstName: string, lastName: string, fieldRole: string | null = null): MemberRef {
  return { id, firstName, lastName, fieldRole };
}

export const GIULIA = member("m-giulia", "Giulia", "Rossi", "Schiacciatrice");
export const SARA = member("m-sara", "Sara", "Conti", "Libero");
export const ANNA = member("m-anna", "Anna", "Ferri");
export const CHIARA = member("m-chiara", "Chiara", "Neri");
export const ELENA = member("m-elena", "Elena", "Russo");
export const MARTA = member("m-marta", "Marta", "Bianchi");
export const BEATRICE = member("m-beatrice", "Beatrice", "Gallo");
export const ILARIA = member("m-ilaria", "Ilaria", "Riva");
export const FEDERICA = member("m-federica", "Federica", "Greco", "Opposto");
export const LUISA = member("m-luisa", "Luisa", "Villa", "Centrale");

export function makeConvocation(
  who: MemberRef,
  status: ConvocationStatus,
  overrides: Partial<Convocation> = {},
): Convocation {
  return {
    id: `cv-${who.id}`,
    event: { id: MATCH_EVENT.id, type: "MATCH", title: MATCH_EVENT.title, startsAt: MATCH_EVENT.startsAt, status: "SCHEDULED" },
    member: who,
    status,
    sentAt: at(11, 9, 8, 0),
    respondedAt: status === "PENDING" ? null : at(11, 9, 12, 0),
    declineReason: null,
    overrideReason: null,
    createdAt: at(11, 8, 8, 0),
    updatedAt: at(11, 9, 12, 0),
    ...overrides,
  };
}

export const MATCH_CONVOCATIONS: Convocation[] = [
  makeConvocation(ANNA, "PENDING"),
  makeConvocation(BEATRICE, "CONFIRMED"),
  makeConvocation(CHIARA, "DECLINED", { declineReason: "Esame all'università" }),
  makeConvocation(ELENA, "CONFIRMED"),
  makeConvocation(GIULIA, "CONFIRMED"),
  makeConvocation(ILARIA, "CONFIRMED"),
  makeConvocation(MARTA, "PENDING"),
  makeConvocation(SARA, "CONFIRMED"),
];

export const MATCH_CONVOCATIONS_RESPONSE: EventConvocations = {
  data: MATCH_CONVOCATIONS,
  summary: MATCH_EVENT.convocations,
};

export function rosterMember(who: MemberRef, certificate: "OK" | "EXPIRED" = "OK"): RosterMember {
  return { ...who, status: "ACTIVE", documents: [{ key: "MEDICAL_CERTIFICATE", status: certificate }] };
}

export const ROSTER: RosterMember[] = [
  rosterMember(ANNA),
  rosterMember(GIULIA),
  rosterMember(LUISA),
  rosterMember(FEDERICA, "EXPIRED"),
];

export function attendanceSheet(present: Array<boolean | null>): AttendanceSheet {
  const squad = [ANNA, GIULIA, SARA];
  const data = squad.map((who, index) => ({ member: who, present: present[index] ?? null, note: null }));
  return {
    eventId: TRAINING_EVENT.id,
    summary: {
      present: data.filter((entry) => entry.present === true).length,
      absent: data.filter((entry) => entry.present === false).length,
      notRecorded: data.filter((entry) => entry.present === null).length,
    },
    data,
  };
}

export const TEAM_ATTENDANCE: TeamAttendanceSummary = {
  team: TEAM_SERIE_D,
  trainings: 8,
  summary: { present: 21, total: 24, percentage: 87.5 },
  members: [
    { member: GIULIA, present: 8, total: 8, percentage: 100 },
    { member: SARA, present: 5, total: 8, percentage: 62.5 },
    { member: ANNA, present: 8, total: 8, percentage: 100 },
  ],
};
