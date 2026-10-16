export const SCHEDULER_TIMEZONE = 'Europe/Rome';

// An automation whose hour is configurable is still attempted this many hours after its hour (same local day), so a
// restart or a missed tick does not skip the day. The run key makes the extra attempts harmless.
export const CATCH_UP_HOURS = 3;

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHEDULER_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export interface LocalClock {
  // YYYY-MM-DD in Europe/Rome.
  date: string;
  // 0-23 in Europe/Rome.
  hour: number;
}

export function localClock(now: Date): LocalClock {
  const parts = Object.fromEntries(clockFormat.formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// Idempotency bucket of a daily automation: the local calendar day, so a society's day never splits in two.
export function localDayRunKey(now: Date): string {
  return localClock(now).date;
}

// Cron expression of "every day at HH:00" (Europe/Rome).
export function dailyCron(hour: number): string {
  return `0 ${hour} * * *`;
}

// Whether a daily run configured for `hour` is due at `now`: from that hour until the end of the catch-up window,
// never across midnight (the next day has its own run).
export function isDailyRunDue(hour: number, now: Date): boolean {
  const elapsed = localClock(now).hour - hour;
  return elapsed >= 0 && elapsed < CATCH_UP_HOURS;
}
