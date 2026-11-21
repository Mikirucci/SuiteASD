import { addDays, startOfDay, startOfWeek, toDayKey } from "@/lib/dates";

/** First and last day of a period, both included, as local calendar days. */
export interface DayRange {
  from: Date;
  to: Date;
}

/** What a range is: a whole week (Monday to Sunday), a whole month, a whole year, or any other stretch of days. */
export type PeriodMode = "week" | "month" | "year" | "custom";

/** The week (Monday to Sunday), the month or the year that contains `anchor`. */
export function rangeOf(mode: Exclude<PeriodMode, "custom">, anchor: Date): DayRange {
  if (mode === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (mode === "month") {
    return { from: new Date(anchor.getFullYear(), anchor.getMonth(), 1), to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0) };
  }
  return { from: new Date(anchor.getFullYear(), 0, 1), to: new Date(anchor.getFullYear(), 11, 31) };
}

export function isSameRange(a: DayRange, b: DayRange): boolean {
  return toDayKey(a.from) === toDayKey(b.from) && toDayKey(a.to) === toDayKey(b.to);
}

/** The period is not stored with a mode: a range that is exactly a week, a month or a year is one. */
export function modeOf(range: DayRange): PeriodMode {
  for (const mode of ["week", "month", "year"] as const) {
    if (isSameRange(range, rangeOf(mode, range.from))) return mode;
  }
  return "custom";
}

/** The period the page opens on, and the one "Azzera filtri" goes back to: the current year. */
export function defaultRange(today: Date): DayRange {
  return rangeOf("year", today);
}

/** True when the page shows what it shows when opened, so there is nothing to reset. */
export function isDefaultRange(range: DayRange, today: Date): boolean {
  return isSameRange(range, defaultRange(today));
}

/** Whole days between two calendar days, both included (a week is 7): UTC keeps a change of daylight time out of it. */
function lengthInDays({ from, to }: DayRange): number {
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((day(to) - day(from)) / 86_400_000) + 1;
}

/**
 * The period before (`step` -1) or after (`step` 1): the previous week, month or year, and for a free range the days
 * of the same length that come right before or after it.
 */
export function shiftRange(range: DayRange, step: -1 | 1): DayRange {
  const mode = modeOf(range);
  const { from, to } = range;
  if (mode === "week") return rangeOf(mode, addDays(from, 7 * step));
  if (mode === "month") return rangeOf(mode, new Date(from.getFullYear(), from.getMonth() + step, 1));
  if (mode === "year") return rangeOf(mode, new Date(from.getFullYear() + step, 0, 1));
  const days = lengthInDays(range) * step;
  return { from: addDays(from, days), to: addDays(to, days) };
}

/** The `from` and `to` query parameters of the API. */
export function rangeQuery(range: DayRange): { from: string; to: string } {
  return { from: toDayKey(range.from), to: toDayKey(range.to) };
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(key: string | null): Date | null {
  const match = key ? DAY_KEY.exec(key) : null;
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // 2026-02-31 would roll over to March: only days that exist are accepted
  return toDayKey(date) === key ? date : null;
}

/** The period written in the address (\`dal\` and \`al\`); anything missing, wrong or upside down is the default one. */
export function parseRange(from: string | null, to: string | null, today: Date): DayRange {
  const start = parseDay(from);
  const end = parseDay(to);
  return start && end && start <= end ? { from: start, to: end } : defaultRange(startOfDay(today));
}

/** The address query of a period: nothing for the default one, so the plain page keeps its plain address. */
export function rangeSearch(range: DayRange, today: Date): string {
  return isDefaultRange(range, today) ? "" : `dal=${toDayKey(range.from)}&al=${toDayKey(range.to)}`;
}

const dayMonthYear = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });
const dayMonthShort = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const dayMonthShortYear = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });
const dayOnly = new Intl.DateTimeFormat("it-IT", { day: "numeric" });
const monthYear = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
const monthLong = new Intl.DateTimeFormat("it-IT", { month: "long" });

/** "19 – 25 ottobre 2026", "28 set – 4 ott 2026", "28 dic 2026 – 3 gen 2027" or, for one day, "5 ottobre 2026". */
export function formatRange({ from, to }: DayRange): string {
  if (toDayKey(from) === toDayKey(to)) return dayMonthYear.format(from);
  if (from.getFullYear() !== to.getFullYear()) return `${dayMonthShortYear.format(from)} – ${dayMonthShortYear.format(to)}`;
  if (from.getMonth() !== to.getMonth()) return `${dayMonthShort.format(from)} – ${dayMonthShort.format(to)} ${to.getFullYear()}`;
  return `${dayOnly.format(from)} – ${dayOnly.format(to)} ${monthLong.format(to)} ${to.getFullYear()}`;
}

/** What the period control writes between the arrows: "Ottobre 2026", "2026" or the days of a week or a free range. */
export function formatPeriod(range: DayRange): string {
  const mode = modeOf(range);
  if (mode === "month") {
    const label = monthYear.format(range.from);
    return label.charAt(0).toLocaleUpperCase("it-IT") + label.slice(1);
  }
  if (mode === "year") return String(range.from.getFullYear());
  return formatRange(range);
}
