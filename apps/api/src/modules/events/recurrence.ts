// Weekly recurrence of trainings (SPEC 04), expanded in the society time zone so that "Thursday 19:00" stays
// 19:00 on the wall clock across daylight saving changes.

export const MAX_OCCURRENCES = 100;

export interface WeeklyRecurrence {
  interval: number;
  until?: string; // date only, inclusive, society time zone
  count?: number; // total occurrences including the first
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockOf(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function asUtcMillis(clock: WallClock): number {
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
}

// The instant whose wall clock in `timeZone` reads `clock` (the later one for a repeated hour; a skipped hour moves forward).
export function zonedTimeToUtc(clock: WallClock, timeZone: string): Date {
  const wanted = asUtcMillis(clock);
  let guess = wanted;
  for (let pass = 0; pass < 3; pass += 1) {
    const offset = asUtcMillis(wallClockOf(new Date(guess), timeZone)) - guess;
    guess = wanted - offset;
  }
  return new Date(guess);
}

export function expandWeekly(start: Date, recurrence: WeeklyRecurrence, timeZone: string): Date[] {
  const first = wallClockOf(start, timeZone);
  const limit = Math.min(recurrence.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const lastDay = recurrence.until ? Date.parse(`${recurrence.until}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  const occurrences: Date[] = [];
  for (let index = 0; occurrences.length < limit; index += 1) {
    const day = new Date(Date.UTC(first.year, first.month - 1, first.day + index * recurrence.interval * 7));
    if (day.getTime() > lastDay) break;
    occurrences.push(
      zonedTimeToUtc(
        { ...first, year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() },
        timeZone,
      ),
    );
  }
  return occurrences;
}

// iCal RRULE stored on the first occurrence of the series (Event.recurrenceRule).
export function toRrule(recurrence: WeeklyRecurrence): string {
  const parts = ['FREQ=WEEKLY', `INTERVAL=${recurrence.interval}`];
  if (recurrence.count !== undefined) parts.push(`COUNT=${recurrence.count}`);
  if (recurrence.until !== undefined) parts.push(`UNTIL=${recurrence.until.replaceAll('-', '')}`);
  return parts.join(';');
}
