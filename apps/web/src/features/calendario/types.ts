/** Wire types of the calendar endpoints. Source of truth: apps/api/src/modules/{events,convocations,attendance}/schema.ts. */

export type EventType = "MATCH" | "TRAINING" | "TOURNAMENT" | "MEETING";
export type EventStatus = "SCHEDULED" | "POSTPONED" | "CANCELLED" | "COMPLETED";
export type ConvocationStatus = "PENDING" | "CONFIRMED" | "DECLINED";

export interface ConvocationSummary {
  confirmed: number;
  declined: number;
  pending: number;
  /** Convocated athletes. */
  total: number;
  /** Convocation slots of the event ("5/12 confermate"). */
  capacity: number;
}

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: EventStatus;
  notes: string | null;
  team: { id: string; name: string } | null;
  venue: { id: string; name: string; address: string | null } | null;
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
  convocations: ConvocationSummary;
  convocationsSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedEvent extends CalendarEvent {
  /** 1 for a single event, the series length for a recurrence. */
  occurrencesCreated: number;
}

export interface RecurrenceBody {
  frequency: "WEEKLY";
  interval: number;
  until?: string;
  count?: number;
}

export interface CreateEventBody {
  type: EventType;
  title: string;
  startsAt: string;
  endsAt?: string;
  teamId?: string;
  venueId?: string;
  notes?: string;
  maxConvocations?: number;
  recurrence?: RecurrenceBody;
}

/** PATCH: `null` clears an optional field. */
export interface UpdateEventBody {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  teamId?: string | null;
  venueId?: string | null;
  notes?: string | null;
  maxConvocations?: number | null;
}

export interface MemberRef {
  id: string;
  firstName: string;
  lastName: string;
  fieldRole: string | null;
}

export interface Convocation {
  id: string;
  event: { id: string; type: EventType; title: string; startsAt: string; status: EventStatus };
  member: MemberRef;
  status: ConvocationStatus;
  sentAt: string | null;
  respondedAt: string | null;
  declineReason: string | null;
  /** Set when an administrator convocated an ineligible athlete; staff only. */
  overrideReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventConvocations {
  data: Convocation[];
  summary: ConvocationSummary;
}

export interface SendConvocationsResult {
  eventId: string;
  sent: number;
  notified: number;
  convocationsSentAt: string | null;
}

export interface RemindConvocationsResult {
  eventId: string;
  reminded: number;
  notified: number;
}

export interface RespondBody {
  status: "CONFIRMED" | "DECLINED";
  reason?: string;
}

export interface AttendanceEntry {
  member: MemberRef;
  /** null = not recorded yet. */
  present: boolean | null;
  note: string | null;
}

export interface AttendanceSheet {
  eventId: string;
  summary: { present: number; absent: number; notRecorded: number };
  data: AttendanceEntry[];
}

export interface CheckInBody {
  entries: Array<{ memberId: string; present: boolean }>;
}

export interface AttendanceTotals {
  present: number;
  /** Recorded attendances. */
  total: number;
  /** present / total in %, one decimal; null when nothing is recorded. */
  percentage: number | null;
}

export interface MemberAttendanceHistory {
  member: MemberRef;
  summary: AttendanceTotals;
  data: Array<{ eventId: string; title: string; startsAt: string; present: boolean; note: string | null }>;
  page: { nextCursor: string | null; hasMore: boolean };
}

export interface TeamAttendanceSummary {
  team: { id: string; name: string };
  /** Trainings of the period with a recorded check-in. */
  trainings: number;
  summary: AttendanceTotals;
  members: Array<AttendanceTotals & { member: MemberRef }>;
}

export interface TeamOption {
  id: string;
  name: string;
  category: string | null;
}

export interface VenueOption {
  id: string;
  name: string;
  address: string | null;
}

export type CertificateState = "OK" | "EXPIRING" | "EXPIRED" | "MISSING";

/** The part of a member row the convocation picker needs (apps/api members module). */
export interface RosterMember extends MemberRef {
  status: "ACTIVE" | "INACTIVE";
  documents: Array<{ key: string; status: CertificateState }>;
}

/** Where a match sits in the competitions: the eyebrow of the match card. */
export interface MatchContext {
  competition: string;
  group: string;
  round: number | null;
}
