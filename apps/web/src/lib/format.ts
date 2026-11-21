const MAX_AMOUNT_CENTS = 10_000_000;

/** "€ 60", "€ 60,50", "€ 1.240": whole euros lose the decimals, as in the product video. */
export function formatEuro(cents: number): string {
  const whole = cents % 100 === 0;
  const amount = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `€ ${amount}`;
}

/** "60" / "60,5" / "1.250,00" -> cents; null when the text is not a valid amount for the API. */
export function parseEuroToCents(input: string): number | null {
  const text = input.replace(/[\s€]/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents >= 1 && cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/** Cents as the text of an input: 6050 -> "60,50", 6000 -> "60". */
export function centsToInput(cents: number): string {
  return (cents / 100).toString().replace(".", ",");
}

/** A "YYYY-MM-DD" day as a local calendar date (no timezone shift). */
export function dayToDate(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/** "10 nov 2026" from "2026-11-10". */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(dayToDate(day));
}

/** "10 nov" from "2026-11-10": the year is left out in lists. */
export function formatDayShort(day: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(dayToDate(day));
}

/** "10 nov 2026" from an ISO date-time. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

/** Singular/plural helper for counts: pluralize(2, "quota", "quote") -> "2 quote". */
export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Just the word that goes with a count shown on its own: pluralWord(2, "quota", "quote") -> "quote". */
export function pluralWord(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
