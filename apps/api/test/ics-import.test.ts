import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIcs } from '../src/modules/events/ics-import.js';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety, createTeam, type Actor } from './helpers/factories.js';

const ZONE = 'Europe/Rome';
const wrap = (...events: string[]): string =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//IT', ...events.flatMap((event) => ['BEGIN:VEVENT', ...event.split('\n'), 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

describe('parseIcs (unit)', () => {
  it('reads UTC, floating and TZID start times', () => {
    const { events, problems, allDay } = parseIcs(
      wrap(
        'UID:a\nSUMMARY:Allenamento U16\nDTSTART:20261112T180000Z\nDTEND:20261112T193000Z\nLOCATION:Palazzetto\\, Via Roma 1\nDESCRIPTION:Portare le scarpe\\npulite',
        'UID:b\nSUMMARY:Partita\nDTSTART:20261114T203000',
        'UID:c\nSUMMARY:Torneo\nDTSTART;TZID=Europe/London:20261115T100000',
      ),
      ZONE,
    );
    expect(problems).toEqual([]);
    expect(allDay).toBe(0);
    expect(events.map((event) => event.startsAt.toISOString())).toEqual(['2026-11-12T18:00:00.000Z', '2026-11-14T19:30:00.000Z', '2026-11-15T10:00:00.000Z']);
    expect(events[0]).toMatchObject({
      uid: 'a',
      summary: 'Allenamento U16',
      location: 'Palazzetto, Via Roma 1',
      description: 'Portare le scarpe\npulite',
    });
    expect(events[0]?.endsAt?.toISOString()).toBe('2026-11-12T19:30:00.000Z');
    expect(events[1]?.endsAt).toBeNull();
  });

  it('unfolds long lines and ignores a byte order mark', () => {
    const text = `${String.fromCharCode(0xfeff)}${wrap('SUMMARY:Allenamento di preparazione\n alla stagione\nDTSTART:20261112T180000Z')}`;
    expect(parseIcs(text, ZONE).events[0]?.summary).toBe('Allenamento di preparazionealla stagione');
  });

  it('skips all-day events and reports events it cannot read', () => {
    const { events, problems, allDay } = parseIcs(
      wrap('SUMMARY:Festa\nDTSTART;VALUE=DATE:20261201', 'DTSTART:20261112T180000Z', 'SUMMARY:Senza data', 'SUMMARY:Data strana\nDTSTART:domani'),
      ZONE,
    );
    expect(events).toEqual([]);
    expect(allDay).toBe(1);
    expect(problems.map((problem) => problem.event)).toEqual([2, 3, 4]);
    expect(problems[0]?.message).toMatch(/no title/);
  });

  it('refuses a file with no event', () => {
    expect(() => parseIcs('hello', ZONE)).toThrow(/does not contain any event/);
  });
});

describe('importing an iCalendar file', () => {
  let ctx: TestContext;
  let societyId: string;
  let teamId: string;
  const actors = {} as Record<Role, Actor>;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Ics ASD')).id;
    teamId = (await createTeam(ctx, societyId, 'Under 16')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const send = (actor: Actor | null, payload: object) =>
    ctx.app.inject({ method: 'POST', url: `${API}/events/import`, headers: actor?.headers, payload });
  const events = () => ctx.prisma.event.findMany({ where: { societyId }, orderBy: { startsAt: 'asc' } });

  it('checks first, and creates nothing on a dry run', async () => {
    const ics = wrap('SUMMARY:Allenamento\nDTSTART:20271104T180000Z\nDTEND:20271104T193000Z');
    const response = await send(actors.ADMIN, { ics, teamId });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ dryRun: true, eventsInFile: 1, created: 1, alreadyPresent: 0, allDaySkipped: 0, repetitionsNotImported: 0, errors: [] });
    expect(await events()).toEqual([]);
  });

  it('creates the events with type, team, venue, duration and the place in the notes', async () => {
    const venue = await ctx.prisma.venue.create({ data: { societyId, name: 'Palazzetto' } });
    const ics = wrap('SUMMARY:Allenamento U16\nDTSTART:20271105T180000Z\nDTEND:20271105T193000Z\nLOCATION:Via Roma 1\nDESCRIPTION:Scarpe pulite');
    const response = await send(actors.ADMIN, { ics, teamId, venueId: venue.id, dryRun: false });
    expect(response.json()).toMatchObject({ dryRun: false, created: 1 });
    const [event] = await events();
    expect(event).toMatchObject({ type: 'TRAINING', title: 'Allenamento U16', teamId, venueId: venue.id, notes: 'Via Roma 1\nScarpe pulite', status: 'SCHEDULED' });
    expect(event?.startsAt.toISOString()).toBe('2027-11-05T18:00:00.000Z');
    expect(event?.endsAt?.toISOString()).toBe('2027-11-05T19:30:00.000Z');
  });

  it('does not create twice what the calendar already has', async () => {
    const ics = wrap('SUMMARY:Allenamento U16\nDTSTART:20271105T180000Z', 'SUMMARY:Altro\nDTSTART:20271106T180000Z');
    const response = await send(actors.ADMIN, { ics, teamId, dryRun: false });
    expect(response.json()).toMatchObject({ created: 1, alreadyPresent: 1 });
    expect((await events()).filter((event) => event.title === 'Allenamento U16')).toHaveLength(1);
  });

  it('expands a weekly training series and links the occurrences to the first', async () => {
    const ics = wrap('SUMMARY:Allenamento del giovedì\nDTSTART;TZID=Europe/Rome:20271111T190000\nDTEND;TZID=Europe/Rome:20271111T203000\nRRULE:FREQ=WEEKLY;COUNT=4');
    const dry = (await send(actors.ADMIN, { ics })).json();
    expect(dry).toMatchObject({ created: 4, repetitionsNotImported: 0 });
    await send(actors.ADMIN, { ics, dryRun: false });
    const series = (await events()).filter((event) => event.title === 'Allenamento del giovedì');
    expect(series.map((event) => event.startsAt.toISOString())).toEqual([
      '2027-11-11T18:00:00.000Z',
      '2027-11-18T18:00:00.000Z',
      '2027-11-25T18:00:00.000Z',
      '2027-12-02T18:00:00.000Z',
    ]);
    const [first, ...rest] = series;
    expect(first?.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=1;COUNT=4');
    expect(rest.every((event) => event.recurrenceParentId === first?.id)).toBe(true);
    // 19:00 stays 19:00 on the wall clock across the end of daylight saving time (31 October is before: all winter here)
    expect(series.every((event) => event.endsAt && event.endsAt.getTime() - event.startsAt.getTime() === 5_400_000)).toBe(true);
  });

  it('follows UNTIL, and keeps the 19:00 across the change of the clocks', async () => {
    const ics = wrap('SUMMARY:Serale\nDTSTART;TZID=Europe/Rome:20271021T190000\nRRULE:FREQ=WEEKLY;UNTIL=20271104T000000Z');
    await send(actors.ADMIN, { ics, dryRun: false });
    const series = (await events()).filter((event) => event.title === 'Serale');
    expect(series.map((event) => event.startsAt.toISOString())).toEqual([
      '2027-10-21T17:00:00.000Z',
      '2027-10-28T17:00:00.000Z',
      // Clocks went back on 31 October 2027: the same wall clock is one hour later in UTC
      '2027-11-04T18:00:00.000Z',
    ]);
  });

  it('brings in only the first date of repetitions it cannot expand, and says so', async () => {
    const ics = wrap(
      'SUMMARY:Ogni martedì e giovedì\nDTSTART:20271207T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH',
      'SUMMARY:Mensile\nDTSTART:20271208T180000Z\nRRULE:FREQ=MONTHLY',
    );
    const response = (await send(actors.ADMIN, { ics, dryRun: false })).json();
    expect(response).toMatchObject({ created: 2, repetitionsNotImported: 2 });
  });

  it('does not repeat matches: only trainings repeat', async () => {
    const ics = wrap('SUMMARY:Torneo\nDTSTART:20271220T100000Z\nRRULE:FREQ=WEEKLY;COUNT=3');
    const response = (await send(actors.ADMIN, { ics, type: 'MATCH', dryRun: false })).json();
    expect(response).toMatchObject({ created: 1, repetitionsNotImported: 1 });
    expect((await events()).find((event) => event.title === 'Torneo')).toMatchObject({ type: 'MATCH' });
  });

  it('reports all-day events and unreadable ones without losing the good ones', async () => {
    const ics = wrap('SUMMARY:Festa\nDTSTART;VALUE=DATE:20271225', 'SUMMARY:Rotto\nDTSTART:boh', 'SUMMARY:Buono\nDTSTART:20271230T100000Z');
    const response = (await send(actors.ADMIN, { ics, dryRun: false })).json();
    expect(response).toMatchObject({ eventsInFile: 3, created: 1, allDaySkipped: 1 });
    expect(response.errors).toEqual([{ event: 2, message: '"Rotto": the start date is missing or not valid' }]);
  });

  it('rejects what is not a calendar, an unknown team or venue, and a file with too many events', async () => {
    expect((await send(actors.ADMIN, { ics: 'non è un calendario' })).statusCode).toBe(422);
    expect((await send(actors.ADMIN, { ics: wrap('SUMMARY:A\nDTSTART:20271230T100000Z'), teamId: 'missing' })).statusCode).toBe(422);
    expect((await send(actors.ADMIN, { ics: wrap('SUMMARY:A\nDTSTART:20271230T100000Z'), venueId: 'missing' })).statusCode).toBe(422);
    const many = wrap(...Array.from({ length: 301 }, (_, index) => `SUMMARY:E${index}\nDTSTART:20280101T100000Z`));
    expect((await send(actors.ADMIN, { ics: many })).statusCode).toBe(422);
    expect((await send(actors.ADMIN, { ics: wrap('SUMMARY:A\nDTSTART:20271230T100000Z'), type: 'PARTY' })).statusCode).toBe(422);
  });

  it('is for those who write events, and stays inside the society', async () => {
    const ics = wrap('SUMMARY:Solo mio\nDTSTART:20290101T100000Z');
    for (const role of ROLES) {
      const allowed = ['ADMIN', 'SEGRETERIA', 'ALLENATORE'].includes(role);
      expect((await send(actors[role], { ics })).statusCode, role).toBe(allowed ? 200 : 403);
    }
    expect((await send(null, { ics })).statusCode).toBe(401);
    const other = await createSociety(ctx, 'Altra ASD');
    const outsider = await createActor(ctx, other.id, 'ADMIN');
    expect((await send(outsider, { ics, teamId })).statusCode).toBe(422);
    await send(outsider, { ics, dryRun: false });
    expect(await ctx.prisma.event.count({ where: { societyId: other.id } })).toBe(1);
    expect((await events()).some((event) => event.title === 'Solo mio')).toBe(false);
  });
});
