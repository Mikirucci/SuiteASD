import { addDays, startOfWeek } from "@/lib/dates";
import { ApiError, describeError } from "@/lib/api";
import type { CalendarEvent, ConvocationStatus, ConvocationSummary, EventType, MatchContext } from "./types";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  MATCH: "Partita",
  TRAINING: "Allenamento",
  TOURNAMENT: "Torneo",
  MEETING: "Riunione",
};

export const EVENT_TYPE_OPTIONS = (Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((value) => ({
  value,
  label: EVENT_TYPE_LABELS[value],
}));

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("it-IT") + text.slice(1);
}

const dayTitleFormat = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const shortDateTimeFormat = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Sabato 14 novembre". */
export function formatDayTitle(date: Date): string {
  return capitalize(dayTitleFormat.format(date));
}

/** "20:30". */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

const weekdayDateFormat = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });

/** "Gio 12 nov · 19:00": when an appointment is, in one short line. */
export function formatWeekdayTime(iso: string): string {
  return `${capitalize(weekdayDateFormat.format(new Date(iso)))} · ${formatTime(iso)}`;
}

/** "9 nov, 10:00". */
export function formatShortDateTime(iso: string): string {
  return shortDateTimeFormat.format(new Date(iso));
}

/** "Sabato 14 novembre · 20:30 · Palazzetto": the line under the title of an event. */
export function formatWhen(event: Pick<CalendarEvent, "startsAt" | "endsAt" | "venue">): string {
  const start = new Date(event.startsAt);
  const time = event.endsAt ? `${formatTime(event.startsAt)}–${formatTime(event.endsAt)}` : formatTime(event.startsAt);
  return [formatDayTitle(start), time, event.venue?.name].filter(Boolean).join(" · ");
}

/** Monday 00:00 to the next Monday 00:00 (local time), as the ISO instants `GET /events` expects. */
export function weekRange(day: Date): { from: string; to: string } {
  const first = startOfWeek(day);
  return { from: first.toISOString(), to: addDays(first, 7).toISOString() };
}

const dayMonthFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
const dayOnlyFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric" });

/** "9 – 15 novembre 2026", or "30 novembre – 6 dicembre 2026" across months. */
export function weekLabel(day: Date): string {
  const first = startOfWeek(day);
  const last = addDays(first, 6);
  const sameMonth = first.getMonth() === last.getMonth();
  const start = sameMonth ? dayOnlyFormat.format(first) : dayMonthFormat.format(first);
  return `${start} – ${dayMonthFormat.format(last)} ${last.getFullYear()}`;
}

// ---- local date and time fields <-> ISO instants -------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "2026-11-14" in local time, the value of an `<input type="date">`. */
export function toDateInput(source: Date | string): string {
  const date = typeof source === "string" ? new Date(source) : source;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "20:30" in local time, the value of an `<input type="time">`. */
export function toTimeInput(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local "YYYY-MM-DD" + "HH:mm" as an ISO instant. */
export function combineLocal(day: string, time: string): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(year, month - 1, date, hours, minutes).toISOString();
}

// ---- convocations --------------------------------------------------------------------------------------------------

/** "5/12 confermate", or "14 confermati · posti 12" when more athletes confirmed than there are slots. */
export function confirmedText(summary: Pick<ConvocationSummary, "confirmed" | "capacity">): string {
  if (summary.confirmed > summary.capacity) return `${summary.confirmed} confermati · posti ${summary.capacity}`;
  return `${summary.confirmed}/${summary.capacity} confermate`;
}

/**
 * Slots left for manual additions, as the server counts them: the confirmed athletes of a team event (the automatic
 * rows take no slot), every row not declined when the event has no team.
 */
export function freeSlotsOf(hasTeam: boolean, rows: ReadonlyArray<{ status: ConvocationStatus }>, capacity: number): number {
  const taken = rows.filter((row) => (hasTeam ? row.status === "CONFIRMED" : row.status !== "DECLINED")).length;
  return Math.max(0, capacity - taken);
}

/** The match card eyebrow: "SERIE D · GIRONE B · GIORNATA 6", or the team when the match has no competition. */
export function matchEyebrow(event: Pick<CalendarEvent, "team">, context: MatchContext | undefined): string {
  if (!context) return event.team ? event.team.name : "Partita";
  const parts = [context.competition, context.group, context.round ? `Giornata ${context.round}` : null];
  return parts.filter(Boolean).join(" · ");
}

/** An event accepts convocations and answers while it is ahead of us and not cancelled. */
export function isOpen(event: Pick<CalendarEvent, "status" | "startsAt">, now: Date = new Date()): boolean {
  return event.status !== "CANCELLED" && new Date(event.startsAt) > now;
}

export type ClosedReason = "cancelled" | "started";

/** Why an event takes no more answers: it was cancelled or it already started; null while it is still open. */
export function closedReason(event: Pick<CalendarEvent, "status" | "startsAt">, now: Date = new Date()): ClosedReason | null {
  if (event.status === "CANCELLED") return "cancelled";
  return new Date(event.startsAt) > now ? null : "started";
}

export function formatPercent(value: number | null): string {
  if (value === null) return "–";
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const CODE_MESSAGES: Record<string, string> = {
  event_cancelled: "L'evento è stato annullato: non si può più modificare.",
  event_started: "L'evento è già iniziato.",
  capacity_exceeded: "I posti per le convocazioni sono finiti. Togli qualcuno o aumenta i posti dall'evento.",
  member_not_eligible: "Alcuni atleti hanno il certificato medico scaduto e non sono convocabili.",
  member_not_in_team: "Puoi convocare solo gli atleti della squadra dell'evento.",
  member_inactive: "Gli atleti non attivi non si possono convocare.",
  recurrence_not_allowed: "Solo gli allenamenti si possono ripetere ogni settimana.",
  recurrence_empty: "La ripetizione finisce prima del primo allenamento.",
  invalid_time_range: "L'ora di fine deve essere dopo l'ora di inizio.",
  attendance_not_allowed: "Le presenze si registrano solo per gli allenamenti.",
};

/** Italian message for a calendar error: the specific rules first, then the generic wording by status. */
export function describeCalendarError(error: unknown): string {
  if (error instanceof ApiError && error.code) {
    const message = CODE_MESSAGES[error.code];
    if (message) return message;
  }
  return describeError(error);
}
