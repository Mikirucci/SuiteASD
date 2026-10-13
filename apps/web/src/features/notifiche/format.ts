const timeFormat = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const dayWithYearFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });

function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** "Oggi, 14:30", "Ieri, 09:05", "12 nov, 18:00" (with the year when it is not the current one). */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = timeFormat.format(date);
  const daysAgo = dayNumber(now) - dayNumber(date);
  if (daysAgo === 0) return `Oggi, ${time}`;
  if (daysAgo === 1) return `Ieri, ${time}`;
  const day = date.getFullYear() === now.getFullYear() ? dayFormat.format(date) : dayWithYearFormat.format(date);
  return `${day}, ${time}`;
}

export function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
