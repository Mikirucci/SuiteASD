import { unprocessable } from '../../lib/errors.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { MAX_OCCURRENCES, expandWeekly, toRrule, zonedTimeToUtc, type WeeklyRecurrence } from './recurrence.js';
import type { ImportEventsBody, ImportEventsResult } from './schema.js';

// Import of an iCalendar file (.ics) into the calendar (docs/DECISIONS.md D-25): the training schedule kept in
// Google Calendar, a fixture list a federation or a gym publishes as a calendar file. Weekly repetitions are
// expanded (trainings only); anything else repeating comes in once, and the report says so.

export const MAX_ICS_EVENTS = 300;

export interface IcsEvent {
  uid: string | null;
  summary: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  description: string | null;
  rrule: string | null;
}

interface Property {
  name: string;
  params: Map<string, string>;
  value: string;
}

// RFC 5545 line folding: a line that starts with a space or a tab continues the previous one.
function unfold(text: string): string[] {
  const lines: string[] = [];
  const withoutBom = text.startsWith(String.fromCharCode(0xfeff)) ? text.slice(1) : text;
  for (const raw of withoutBom.split(/\r?\n/)) {
    const previous = lines.at(-1);
    if (previous !== undefined && (raw.startsWith(' ') || raw.startsWith('\t'))) lines[lines.length - 1] = previous + raw.slice(1);
    else lines.push(raw);
  }
  return lines;
}

function parseProperty(line: string): Property | null {
  const colon = line.indexOf(':');
  if (colon < 1) return null;
  const [name = '', ...rest] = line.slice(0, colon).split(';');
  const params = new Map<string, string>();
  for (const part of rest) {
    const equals = part.indexOf('=');
    if (equals > 0) params.set(part.slice(0, equals).toUpperCase(), part.slice(equals + 1).replace(/^"|"$/g, ''));
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

const isZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

// "20261112T190000Z" is an instant; "20261112T190000" (with or without TZID) is a wall clock in a zone; a date alone
// is an all-day event, which is not a training or a match.
function parseDateTime(property: Property, defaultZone: string): Date | 'all-day' | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(property.value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;
  if (hour === undefined) return 'all-day';
  const clock = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second ?? 0) };
  if (utc) return new Date(Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second));
  const zone = property.params.get('TZID');
  return zonedTimeToUtc(clock, zone && isZone(zone) ? zone : defaultZone);
}

function weeklyRule(rrule: string): WeeklyRecurrence | null {
  const parts = new Map(rrule.split(';').map((part) => part.split('=') as [string, string]));
  // Several weekdays in one rule (Tuesday and Thursday) is not a plain weekly series
  if (parts.get('FREQ') !== 'WEEKLY' || (parts.get('BYDAY') ?? '').includes(',')) return null;
  const interval = Number(parts.get('INTERVAL') ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 4) return null;
  const count = parts.has('COUNT') ? Number(parts.get('COUNT')) : undefined;
  const until = parts.get('UNTIL');
  const untilDate = until ? /^(\d{4})(\d{2})(\d{2})/.exec(until) : null;
  const recurrence: WeeklyRecurrence = { interval };
  if (count !== undefined) {
    if (!Number.isInteger(count) || count < 1) return null;
    recurrence.count = Math.min(count, MAX_OCCURRENCES);
  } else if (untilDate) {
    recurrence.until = `${untilDate[1]}-${untilDate[2]}-${untilDate[3]}`;
  } else {
    // A series with no end: the next ten weeks, not forever
    recurrence.count = 10;
  }
  return recurrence;
}

export interface ParsedIcs {
  events: IcsEvent[];
  problems: { event: number; message: string }[];
  /** Events skipped because they last all day. */
  allDay: number;
}

export function parseIcs(text: string, zone: string): ParsedIcs {
  const events: IcsEvent[] = [];
  const problems: ParsedIcs['problems'] = [];
  let allDay = 0;
  let current: Property[] | null = null;
  let index = 0;

  for (const line of unfold(text)) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      current = [];
      index += 1;
    } else if (upper === 'END:VEVENT' && current) {
      const get = (name: string): Property | undefined => current?.find((property) => property.name === name);
      const summary = get('SUMMARY')?.value.trim();
      const start = get('DTSTART');
      const parsedStart = start ? parseDateTime(start, zone) : null;
      const end = get('DTEND');
      const parsedEnd = end ? parseDateTime(end, zone) : null;
      if (parsedStart === 'all-day') allDay += 1;
      else if (!summary) problems.push({ event: index, message: 'The event has no title' });
      else if (!parsedStart) problems.push({ event: index, message: `"${summary}": the start date is missing or not valid` });
      else {
        events.push({
          uid: get('UID')?.value.trim() ?? null,
          summary: unescapeText(summary).slice(0, 160),
          startsAt: parsedStart,
          endsAt: parsedEnd instanceof Date && parsedEnd > parsedStart ? parsedEnd : null,
          location: get('LOCATION')?.value ? unescapeText(get('LOCATION')?.value ?? '').slice(0, 200) : null,
          description: get('DESCRIPTION')?.value ? unescapeText(get('DESCRIPTION')?.value ?? '').slice(0, 1000) : null,
          rrule: get('RRULE')?.value ?? null,
        });
      }
      current = null;
    } else if (current) {
      const property = parseProperty(line);
      if (property) current.push(property);
    }
  }
  if (index === 0) throw unprocessable('invalid_ics', 'The file does not contain any event: is it an iCalendar (.ics) file?');
  return { events, problems, allDay };
}

export async function importEvents(ctx: TenantRequestContext, body: ImportEventsBody): Promise<ImportEventsResult> {
  const { db, auth } = ctx;
  if (body.teamId && !(await db.team.findFirst({ where: { id: body.teamId }, select: { id: true } }))) {
    throw unprocessable('team_not_found', 'The team does not exist');
  }
  if (body.venueId && !(await db.venue.findFirst({ where: { id: body.venueId }, select: { id: true } }))) {
    throw unprocessable('venue_not_found', 'The venue does not exist');
  }
  const society = await db.society.findFirstOrThrow({ select: { timezone: true } });
  const parsed = parseIcs(body.ics, society.timezone);
  if (parsed.events.length + parsed.problems.length > MAX_ICS_EVENTS) {
    throw unprocessable('too_many_events', `At most ${MAX_ICS_EVENTS} events can be imported at once`);
  }

  interface Planned {
    title: string;
    startsAt: Date;
    endsAt: Date | null;
    notes: string | null;
    recurrenceRule: string | null;
    recurrenceParent: boolean;
  }
  const planned: Planned[] = [];
  let repetitionsNotImported = 0;
  for (const event of parsed.events) {
    const notes = [event.location, event.description].filter((part): part is string => Boolean(part)).join('\n') || null;
    const durationMs = event.endsAt ? event.endsAt.getTime() - event.startsAt.getTime() : null;
    const recurrence = event.rrule ? weeklyRule(event.rrule) : null;
    if (event.rrule && !(recurrence && body.type === 'TRAINING')) repetitionsNotImported += 1;
    const starts = recurrence && body.type === 'TRAINING' ? expandWeekly(event.startsAt, recurrence, society.timezone) : [event.startsAt];
    starts.forEach((start, position) => {
      planned.push({
        title: event.summary,
        startsAt: start,
        endsAt: durationMs === null ? null : new Date(start.getTime() + durationMs),
        notes,
        recurrenceRule: position === 0 && recurrence && starts.length > 1 ? toRrule(recurrence) : null,
        recurrenceParent: position === 0,
      });
    });
  }

  const existing = await db.event.findMany({
    where: { teamId: body.teamId ?? null, startsAt: { in: planned.map((item) => item.startsAt) } },
    select: { title: true, startsAt: true },
  });
  const taken = new Set(existing.map((item) => `${item.title.toLowerCase()}|${item.startsAt.getTime()}`));
  const fresh: Planned[] = [];
  for (const item of planned) {
    const key = `${item.title.toLowerCase()}|${item.startsAt.getTime()}`;
    if (taken.has(key)) continue;
    taken.add(key);
    fresh.push(item);
  }

  const result: ImportEventsResult = {
    dryRun: body.dryRun,
    eventsInFile: parsed.events.length + parsed.problems.length + parsed.allDay,
    created: fresh.length,
    alreadyPresent: planned.length - fresh.length,
    allDaySkipped: parsed.allDay,
    repetitionsNotImported,
    errors: parsed.problems,
  };
  if (body.dryRun || fresh.length === 0) return result;

  await db.$transaction(async (tx) => {
    let rootId: string | null = null;
    for (const item of fresh) {
      const row: { id: string } = await tx.event.create({
        data: {
          societyId: auth.societyId,
          type: body.type,
          title: item.title,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          teamId: body.teamId ?? null,
          venueId: body.venueId ?? null,
          notes: item.notes,
          recurrenceRule: item.recurrenceRule,
          recurrenceParentId: item.recurrenceParent ? null : rootId,
        },
        select: { id: true },
      });
      // The first occurrence of a series is the parent of the following ones
      if (item.recurrenceParent) rootId = row.id;
    }
  });
  return result;
}
