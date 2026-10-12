import { describe, expect, it } from 'vitest';
import { buildIcalendar } from '../../src/modules/events/ical.js';
import { MAX_OCCURRENCES, expandWeekly, toRrule, zonedTimeToUtc } from '../../src/modules/events/recurrence.js';

const ROME = 'Europe/Rome';

describe('weekly recurrence', () => {
  it('keeps the wall-clock time when the clocks go back (October) and forward (March)', () => {
    const autumn = expandWeekly(new Date('2026-10-22T17:00:00Z'), { interval: 1, count: 3 }, ROME);
    expect(autumn.map((date) => date.toISOString())).toEqual([
      '2026-10-22T17:00:00.000Z',
      '2026-10-29T18:00:00.000Z',
      '2026-11-05T18:00:00.000Z',
    ]);
    const spring = expandWeekly(new Date('2027-03-25T18:00:00Z'), { interval: 1, count: 3 }, ROME);
    expect(spring.map((date) => date.toISOString())).toEqual([
      '2027-03-25T18:00:00.000Z',
      '2027-04-01T17:00:00.000Z',
      '2027-04-08T17:00:00.000Z',
    ]);
  });

  it('honours the interval, the inclusive end date and the occurrence cap', () => {
    const start = new Date('2026-12-03T18:00:00Z');
    expect(expandWeekly(start, { interval: 2, until: '2027-01-14' }, ROME)).toHaveLength(4);
    expect(expandWeekly(start, { interval: 1, until: '2026-12-03' }, ROME)).toHaveLength(1);
    expect(expandWeekly(start, { interval: 1, until: '2026-12-02' }, ROME)).toHaveLength(0);
    expect(expandWeekly(start, { interval: 1, count: 1000 }, ROME)).toHaveLength(MAX_OCCURRENCES);
  });

  it('resolves a wall-clock time in a zone, picking the later instant for a repeated hour', () => {
    const clock = { year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 };
    expect(zonedTimeToUtc(clock, ROME).toISOString()).toBe('2026-10-25T01:30:00.000Z');
    expect(zonedTimeToUtc({ ...clock, hour: 12 }, ROME).toISOString()).toBe('2026-10-25T11:30:00.000Z');
  });

  it('writes an RRULE for the first occurrence', () => {
    expect(toRrule({ interval: 1, count: 10 })).toBe('FREQ=WEEKLY;INTERVAL=1;COUNT=10');
    expect(toRrule({ interval: 2, until: '2027-01-14' })).toBe('FREQ=WEEKLY;INTERVAL=2;UNTIL=20270114');
  });
});

describe('iCalendar writer (RFC 5545)', () => {
  const event = {
    id: 'ev1',
    title: 'Aquile; Delfini, "finale"',
    startsAt: new Date('2026-11-14T19:30:00Z'),
    endsAt: null,
    cancelled: false,
    location: null,
    description: 'Riga uno\r\nriga due\rriga tre\\fine',
    updatedAt: new Date('2026-10-13T08:00:00.123Z'),
  };

  it('emits CRLF lines, UTC stamps, a default one hour duration and escaped text', () => {
    const text = buildIcalendar([event], 'Aquile, Volley');
    expect(text).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SuiteASD//Calendario//IT',
        'CALSCALE:GREGORIAN',
        'X-WR-CALNAME:Aquile\\, Volley',
        'BEGIN:VEVENT',
        'UID:ev1@suiteasd',
        'DTSTAMP:20261013T080000Z',
        'DTSTART:20261114T193000Z',
        'DTEND:20261114T203000Z',
        'SUMMARY:Aquile\\; Delfini\\, "finale"',
        'STATUS:CONFIRMED',
        'DESCRIPTION:Riga uno\\nriga due\\nriga tre\\\\fine',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
  });

  it('folds long lines at 75 octets without splitting multi-byte characters', () => {
    const text = buildIcalendar([{ ...event, description: 'è'.repeat(100) }], 'Cal');
    const lines = text.split('\r\n');
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(text.replaceAll('\r\n ', '')).toContain(`DESCRIPTION:${'è'.repeat(100)}`);
  });

  it('marks cancelled events and an empty calendar is still valid', () => {
    expect(buildIcalendar([{ ...event, cancelled: true }], 'Cal')).toContain('STATUS:CANCELLED');
    expect(buildIcalendar([], 'Cal')).toBe(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SuiteASD//Calendario//IT\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Cal\r\nEND:VCALENDAR\r\n',
    );
  });
});
