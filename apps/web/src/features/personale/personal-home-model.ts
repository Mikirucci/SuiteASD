import { closedReason } from "@/features/calendario/format";
import type { CalendarEvent, Convocation } from "@/features/calendario/types";
import type { Fee } from "@/features/quote/types";
import type { DocumentIndicator } from "@/features/tesserati/types";
import { addDays, startOfDay, startOfWeek } from "@/lib/dates";
import type { Subject } from "./subjects";

/** How many appointments the table after the current week shows. */
export const AFTER_WEEK_SHOWN = 6;
/** How far past the end of the week events are fetched, so the table after it can fill up. */
const LOOKAHEAD_WEEKS = 6;

export interface HomeWindow {
  /** Start of today (local time): events that began earlier today still show, as "already started". */
  from: Date;
  /** Next Monday 00:00, where "this week" ends. */
  nextWeek: Date;
  /** Upper bound of the events fetched. */
  to: Date;
}

export function homeWindow(now: Date): HomeWindow {
  const nextWeek = addDays(startOfWeek(now), 7);
  return { from: startOfDay(now), nextWeek, to: addDays(nextWeek, LOOKAHEAD_WEEKS * 7) };
}

// ---- appointments --------------------------------------------------------------------------------------------------

/** What the home needs to know about one person to place events and answers: their teams and their certificate. */
export interface SubjectProfile {
  subject: Subject;
  teamIds: ReadonlySet<string>;
  /** The medical certificate is expired: the server leaves such an athlete out of the automatic convocations. */
  certificateExpired: boolean;
}

export interface AppointmentRow {
  key: string;
  event: CalendarEvent;
  /** Whose appointment it is; null for an event of no team that is for everybody. */
  subject: Subject | null;
  convocation: Convocation | null;
  /** A team event the person belongs to, without convocation, while her medical certificate is expired. */
  notConvocable: boolean;
}

/**
 * One row per event and person: the events of the teams of the person, the ones she was convocated to, and the ones of
 * no team (a single row for everybody unless somebody was convocated by hand).
 */
export function buildAppointmentRows(
  events: readonly CalendarEvent[],
  convocations: readonly Convocation[],
  profiles: readonly SubjectProfile[],
): AppointmentRow[] {
  const convocationOf = new Map(convocations.map((convocation) => [`${convocation.event.id}:${convocation.member.id}`, convocation]));
  const byStart = [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return byStart.flatMap((event) => {
    const rows = profiles.flatMap((profile): AppointmentRow[] => {
      const convocation = convocationOf.get(`${event.id}:${profile.subject.memberId}`) ?? null;
      const inTeam = event.team !== null && profile.teamIds.has(event.team.id);
      if (!convocation && !inTeam) return [];
      return [
        {
          key: `${event.id}:${profile.subject.memberId}`,
          event,
          subject: profile.subject,
          convocation,
          notConvocable: convocation === null && profile.certificateExpired,
        },
      ];
    });
    if (rows.length === 0 && event.team === null) {
      return [{ key: event.id, event, subject: null, convocation: null, notConvocable: false }];
    }
    return rows;
  });
}

/** This week (from today to Sunday) and the first few appointments after it. */
export function splitByWeek(rows: readonly AppointmentRow[], window: HomeWindow): { thisWeek: AppointmentRow[]; afterWeek: AppointmentRow[] } {
  const startsAt = (row: AppointmentRow) => new Date(row.event.startsAt).getTime();
  return {
    thisWeek: rows.filter((row) => startsAt(row) >= window.from.getTime() && startsAt(row) < window.nextWeek.getTime()),
    afterWeek: rows.filter((row) => startsAt(row) >= window.nextWeek.getTime()).slice(0, AFTER_WEEK_SHOWN),
  };
}

export type AnswerState =
  | "cancelled"
  | "confirmed"
  | "declined"
  | "pending"
  /** Never answered, and the event already started. */
  | "missed"
  | "not-convocable"
  /** A team event the person has no convocation for, for no reason the data shows. */
  | "none"
  /** An event for everybody: there is nothing to answer. */
  | "not-needed";

export function answerState(row: AppointmentRow, now: Date): AnswerState {
  if (row.event.status === "CANCELLED") return "cancelled";
  if (row.convocation) {
    if (row.convocation.status === "CONFIRMED") return "confirmed";
    if (row.convocation.status === "DECLINED") return "declined";
    return closedReason(row.event, now) === "started" ? "missed" : "pending";
  }
  if (row.subject === null) return "not-needed";
  return row.notConvocable ? "not-convocable" : "none";
}

// ---- summaries of the squares --------------------------------------------------------------------------------------

export type DatedIndicator = DocumentIndicator & { expiresAt: string; daysRemaining: number };

/** The document that expires first (or expired longest ago): documents without a date or still missing do not count. */
export function nearestExpiry(indicators: readonly DocumentIndicator[]): DatedIndicator | null {
  const dated = indicators.filter(
    (indicator): indicator is DatedIndicator => indicator.status !== "MISSING" && indicator.expiresAt !== null && indicator.daysRemaining !== null,
  );
  return dated.reduce<DatedIndicator | null>((nearest, indicator) => (nearest === null || indicator.daysRemaining < nearest.daysRemaining ? indicator : nearest), null);
}

export interface FeeSummary {
  /** Pending and overdue fees. */
  dueCount: number;
  dueCents: number;
  overdueCount: number;
  /** Due fees the payer says she paid ("Ho pagato"), waiting for the administration to register them. */
  claimedCount: number;
  /** The pending (not yet overdue) fee that falls due first. */
  next: Fee | null;
}

export function feeSummary(fees: readonly Fee[]): FeeSummary {
  const due = fees.filter((fee) => fee.status === "PENDING" || fee.status === "OVERDUE");
  const upcoming = due.filter((fee) => fee.status === "PENDING").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    dueCount: due.length,
    dueCents: due.reduce((sum, fee) => sum + fee.amountCents, 0),
    overdueCount: due.filter((fee) => fee.status === "OVERDUE").length,
    claimedCount: due.filter((fee) => fee.claimedAt !== null).length,
    next: upcoming[0] ?? null,
  };
}
