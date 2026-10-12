import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createAthlete, createEvent, inDays } from './helpers/calendar.js';
import { createActor, createSociety, createTeam, type Actor } from './helpers/factories.js';

const READ_ROLES: readonly Role[] = ROLES;
const WRITE_ROLES: readonly Role[] = ['ADMIN', 'SEGRETERIA', 'ALLENATORE'];

describe('events (SPEC 04 calendar)', () => {
  let ctx: TestContext;
  let societyId: string;
  let teamId: string;
  let venueId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;

  const send = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', actor: Actor | null, path: string, body?: object) =>
    ctx.app.inject({ method, url: `${API}${path}`, headers: actor?.headers, payload: body });
  const body = (overrides: object = {}) => ({
    type: 'MATCH',
    title: 'Aquile Volley vs Delfini Volley',
    startsAt: '2026-11-14T20:30:00+01:00',
    endsAt: '2026-11-14T22:30:00+01:00',
    teamId,
    venueId,
    notes: 'Serie D · Girone B · Giornata 6',
    ...overrides,
  });

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Eventi')).id;
    const otherSocietyId = (await createSociety(ctx, 'Altra Societa Eventi')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
    teamId = (await createTeam(ctx, societyId, 'Serie D')).id;
    venueId = (await ctx.prisma.venue.create({ data: { societyId, name: 'Palazzetto', address: 'Via dello Sport 1' } })).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('authorization', () => {
    it('answers 401 with a problem document when no token is sent', async () => {
      const response = await send('GET', null, '/events');
      expect(response.statusCode).toBe(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect((await send('GET', null, '/events/export.ics')).statusCode).toBe(401);
      expect((await send('POST', null, '/events', body())).statusCode).toBe(401);
    });

    it.each(ROLES)('%s listing and exporting get the status of the role matrix', async (role) => {
      const expected = READ_ROLES.includes(role) ? 200 : 403;
      expect((await send('GET', actors[role], '/events')).statusCode).toBe(expected);
      expect((await send('GET', actors[role], '/events/export.ics')).statusCode).toBe(expected);
    });

    it.each(ROLES)('%s creating gets the status of the role matrix', async (role) => {
      const response = await send('POST', actors[role], '/events', body());
      expect(response.statusCode).toBe(WRITE_ROLES.includes(role) ? 201 : 403);
    });

    it('forbids update, cancel and delete to roles without write permission', async () => {
      const event = await createEvent(ctx, societyId);
      for (const role of ROLES.filter((candidate) => !WRITE_ROLES.includes(candidate))) {
        const results = [
          await send('PATCH', actors[role], `/events/${event.id}`, { title: 'Hack' }),
          await send('POST', actors[role], `/events/${event.id}/cancel`, {}),
          await send('DELETE', actors[role], `/events/${event.id}`),
        ];
        expect(results.map((response) => response.statusCode), role).toEqual([403, 403, 403]);
      }
    });
  });

  describe('CRUD', () => {
    it('creates, reads, updates and deletes an event', async () => {
      const created = await send('POST', actors.ALLENATORE, '/events', body());
      expect(created.statusCode).toBe(201);
      const event = created.json();
      expect(event).toMatchObject({
        type: 'MATCH',
        title: 'Aquile Volley vs Delfini Volley',
        startsAt: '2026-11-14T19:30:00.000Z',
        endsAt: '2026-11-14T21:30:00.000Z',
        status: 'SCHEDULED',
        occurrencesCreated: 1,
        team: { id: teamId, name: 'Serie D' },
        venue: { id: venueId, name: 'Palazzetto', address: 'Via dello Sport 1' },
        recurrenceRule: null,
        convocations: { confirmed: 0, declined: 0, pending: 0, total: 0, capacity: 12 },
        convocationsSentAt: null,
      });

      expect((await send('GET', actors.ATLETA, `/events/${event.id}`)).json()).toMatchObject({ id: event.id });

      const updated = await send('PATCH', actors.SEGRETERIA, `/events/${event.id}`, {
        title: 'Aquile vs Delfini',
        notes: null,
        maxConvocations: 14,
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        title: 'Aquile vs Delfini',
        notes: null,
        status: 'SCHEDULED',
        convocations: { capacity: 14 },
      });

      expect((await send('DELETE', actors.ADMIN, `/events/${event.id}`)).statusCode).toBe(204);
      expect((await send('GET', actors.ADMIN, `/events/${event.id}`)).statusCode).toBe(404);
      expect((await send('DELETE', actors.ADMIN, `/events/${event.id}`)).statusCode).toBe(404);
    });

    it('returns 422 with field errors for invalid bodies', async () => {
      const cases: [object, string][] = [
        [{ ...body(), title: '' }, 'title'],
        [{ ...body(), type: 'PARTY' }, 'type'],
        [{ ...body(), startsAt: 'domani' }, 'startsAt'],
        [{ ...body(), endsAt: '2026-11-14T19:00:00+01:00' }, 'endsAt'],
        [{ ...body(), maxConvocations: 0 }, 'maxConvocations'],
        [{ ...body(), recurrence: { frequency: 'DAILY', count: 3 } }, 'recurrence.frequency'],
      ];
      for (const [payload, field] of cases) {
        const response = await send('POST', actors.ADMIN, '/events', payload);
        expect(response.statusCode, field).toBe(422);
        expect(response.json().errors.map((error: { path: string }) => error.path), field).toContain(field);
      }
      const event = await createEvent(ctx, societyId);
      expect((await send('PATCH', actors.ADMIN, `/events/${event.id}`, {})).statusCode).toBe(422);
      const badRange = await send('PATCH', actors.ADMIN, `/events/${event.id}`, { endsAt: new Date(event.startsAt.getTime() - 1000).toISOString() });
      expect(badRange.statusCode).toBe(422);
      expect(badRange.json()).toMatchObject({ code: 'invalid_time_range' });
    });

    it('rejects an unknown team or venue with 404', async () => {
      expect((await send('POST', actors.ADMIN, '/events', body({ teamId: 'missing' }))).statusCode).toBe(404);
      expect((await send('POST', actors.ADMIN, '/events', body({ venueId: 'missing' }))).statusCode).toBe(404);
    });

    it('lists the events of a week with filters and walks the cursor pages', async () => {
      const week = await createSociety(ctx, 'Settimana ASD');
      const admin = await createActor(ctx, week.id, 'ADMIN');
      const team = await createTeam(ctx, week.id, 'U16');
      const monday = new Date('2026-11-09T00:00:00Z');
      const days = [0, 2, 3, 5, 6];
      for (const [index, day] of days.entries()) {
        await createEvent(ctx, week.id, {
          type: index === 4 ? 'MATCH' : 'TRAINING',
          title: `Evento ${index}`,
          startsAt: new Date(monday.getTime() + day * 86_400_000 + 18 * 3_600_000),
          teamId: index < 2 ? team.id : null,
        });
      }
      await createEvent(ctx, week.id, { title: 'Settimana dopo', startsAt: new Date(monday.getTime() + 8 * 86_400_000) });

      const list = (query: string) => ctx.app.inject({ method: 'GET', url: `${API}/events?${query}`, headers: admin.headers });
      const range = `from=${encodeURIComponent('2026-11-09T00:00:00+01:00')}&to=${encodeURIComponent('2026-11-16T00:00:00+01:00')}`;
      const all = (await list(`${range}&limit=100`)).json();
      expect(all.data.map((event: { title: string }) => event.title)).toEqual(['Evento 0', 'Evento 1', 'Evento 2', 'Evento 3', 'Evento 4']);
      expect((await list(`${range}&teamId=${team.id}`)).json().data).toHaveLength(2);
      expect((await list(`${range}&type=MATCH`)).json().data.map((event: { title: string }) => event.title)).toEqual(['Evento 4']);
      expect((await list(`${range}&status=CANCELLED`)).json().data).toEqual([]);

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const response = await list(`${range}&limit=2${cursor ? `&cursor=${cursor}` : ''}`);
        const page: { data: { id: string }[]; page: { nextCursor: string | null } } = response.json();
        seen.push(...page.data.map((event) => event.id));
        cursor = page.page.nextCursor;
        pages += 1;
      } while (cursor);
      expect(pages).toBe(3);
      expect(seen).toEqual(all.data.map((event: { id: string }) => event.id));

      expect((await list('cursor=not-a-cursor')).statusCode).toBe(400);
      expect((await list('from=ieri')).statusCode).toBe(422);
    });
  });

  describe('weekly recurrence', () => {
    it('creates a series of trainings that keeps the wall-clock time across the daylight saving change', async () => {
      const response = await send('POST', actors.ALLENATORE, '/events', {
        type: 'TRAINING',
        title: 'Allenamento Serie D',
        startsAt: '2026-10-22T19:00:00+02:00',
        endsAt: '2026-10-22T20:30:00+02:00',
        teamId,
        recurrence: { frequency: 'WEEKLY', count: 3 },
      });
      expect(response.statusCode).toBe(201);
      const first = response.json();
      expect(first).toMatchObject({ occurrencesCreated: 3, recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=3', recurrenceParentId: null });

      const series = await ctx.prisma.event.findMany({
        where: { OR: [{ id: first.id }, { recurrenceParentId: first.id }] },
        orderBy: { startsAt: 'asc' },
      });
      // Thursday 19:00 is 17:00Z before the clocks go back on Sunday 25 October, 18:00Z after.
      expect(series.map((event) => event.startsAt.toISOString())).toEqual([
        '2026-10-22T17:00:00.000Z',
        '2026-10-29T18:00:00.000Z',
        '2026-11-05T18:00:00.000Z',
      ]);
      expect(series.map((event) => event.endsAt?.toISOString())).toEqual([
        '2026-10-22T18:30:00.000Z',
        '2026-10-29T19:30:00.000Z',
        '2026-11-05T19:30:00.000Z',
      ]);
      expect(series.slice(1).every((event) => event.recurrenceParentId === first.id && event.recurrenceRule === null)).toBe(true);
    });

    it('supports an end date and an interval', async () => {
      const response = await send('POST', actors.ADMIN, '/events', {
        type: 'TRAINING',
        title: 'Allenamento ogni due settimane',
        startsAt: '2026-12-03T19:00:00+01:00',
        recurrence: { frequency: 'WEEKLY', interval: 2, until: '2027-01-14' },
      });
      expect(response.json()).toMatchObject({ occurrencesCreated: 4, recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2;UNTIL=20270114' });
    });

    it('only trainings can repeat, and a series needs either `until` or `count`', async () => {
      const match = await send('POST', actors.ADMIN, '/events', body({ recurrence: { frequency: 'WEEKLY', count: 2 } }));
      expect(match.statusCode).toBe(422);
      expect(match.json()).toMatchObject({ code: 'recurrence_not_allowed' });

      const neither = await send('POST', actors.ADMIN, '/events', body({ type: 'TRAINING', recurrence: { frequency: 'WEEKLY' } }));
      const both = await send('POST', actors.ADMIN, '/events', body({ type: 'TRAINING', recurrence: { frequency: 'WEEKLY', count: 3, until: '2027-01-01' } }));
      expect([neither.statusCode, both.statusCode]).toEqual([422, 422]);

      const empty = await send('POST', actors.ADMIN, '/events', body({ type: 'TRAINING', recurrence: { frequency: 'WEEKLY', until: '2026-01-01' } }));
      expect(empty.json()).toMatchObject({ code: 'recurrence_empty' });
    });
  });

  describe('postponing and cancelling', () => {
    async function trainingWithPeople() {
      const team = await createTeam(ctx, societyId, `Squadra ${Math.random().toString(36).slice(2, 8)}`);
      const convoked = await createAthlete(ctx, societyId, team.id, { athlete: true, guardian: true });
      const teammate = await createAthlete(ctx, societyId, team.id, { athlete: true });
      const stranger = await createAthlete(ctx, societyId, (await createTeam(ctx, societyId)).id, { athlete: true });
      const event = await createEvent(ctx, societyId, { teamId: team.id, startsAt: new Date('2026-11-19T18:00:00Z') });
      await ctx.prisma.convocation.create({ data: { societyId, eventId: event.id, memberId: convoked.member.id } });
      return { event, convoked, teammate, stranger };
    }
    const notificationsOf = (userId: string) => ctx.prisma.notification.findMany({ where: { userId, type: 'EVENT_CHANGED', channel: 'IN_APP' } });

    it('moves an event, marks it POSTPONED and notifies athletes and guardians of the team', async () => {
      const { event, convoked, teammate, stranger } = await trainingWithPeople();
      const response = await send('PATCH', actors.ALLENATORE, `/events/${event.id}`, { startsAt: '2026-11-20T19:00:00+01:00' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'POSTPONED', startsAt: '2026-11-20T18:00:00.000Z' });

      for (const recipient of [convoked.athlete, convoked.guardian, teammate.athlete]) {
        const notifications = await notificationsOf(recipient?.user.id ?? '');
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({
          title: 'Allenamento spostato',
          body: 'Allenamento Serie D: Venerdì 20 novembre alle 19:00',
          channel: 'IN_APP',
          societyId,
        });
        expect(notifications[0]?.data).toEqual({ eventId: event.id, change: 'moved' });
      }
      expect(await notificationsOf(stranger.athlete?.user.id ?? '')).toHaveLength(0);
    });

    it('treats a venue change as a move and a title or notes change as a plain edit', async () => {
      const { event, convoked } = await trainingWithPeople();
      const edit = await send('PATCH', actors.ADMIN, `/events/${event.id}`, { title: 'Allenamento tecnico' });
      expect(edit.json()).toMatchObject({ status: 'SCHEDULED' });
      expect(await notificationsOf(convoked.athlete?.user.id ?? '')).toHaveLength(0);

      const move = await send('PATCH', actors.ADMIN, `/events/${event.id}`, { venueId });
      expect(move.json()).toMatchObject({ status: 'POSTPONED' });
      expect(await notificationsOf(convoked.athlete?.user.id ?? '')).toHaveLength(1);
    });

    it('cancels an event with a reason, notifies everybody and refuses further changes', async () => {
      const { event, convoked } = await trainingWithPeople();
      const response = await send('POST', actors.SEGRETERIA, `/events/${event.id}/cancel`, { reason: 'Palestra chiusa' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'CANCELLED' });

      const [notification] = await notificationsOf(convoked.guardian?.user.id ?? '');
      expect(notification).toMatchObject({ title: 'Allenamento annullato' });
      expect(notification?.body).toContain('Palestra chiusa');
      expect(notification?.data).toEqual({ eventId: event.id, change: 'cancelled' });

      const again = await send('POST', actors.ADMIN, `/events/${event.id}/cancel`, {});
      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'event_cancelled' });
      expect((await send('PATCH', actors.ADMIN, `/events/${event.id}`, { title: 'Nuovo' })).statusCode).toBe(409);
    });
  });

  describe('iCal export', () => {
    it('exports a valid RFC 5545 calendar with escaped text, folded lines and cancelled events', async () => {
      const calendarSociety = await createSociety(ctx, 'Calendario ASD');
      const admin = await createActor(ctx, calendarSociety.id, 'ADMIN');
      const venue = await ctx.prisma.venue.create({
        data: { societyId: calendarSociety.id, name: 'Palestra "Nord"', address: 'Via Roma 1, Bologna' },
      });
      const match = await createEvent(ctx, calendarSociety.id, {
        type: 'MATCH',
        title: 'Aquile; Delfini, finale\\ultima',
        startsAt: new Date('2026-11-14T19:30:00Z'),
        endsAt: new Date('2026-11-14T21:30:00Z'),
        venueId: venue.id,
        notes: `Prima riga\nSeconda riga ${'molto lunga '.repeat(12)}`,
      });
      await createEvent(ctx, calendarSociety.id, { title: 'Annullato', status: 'CANCELLED', startsAt: new Date('2026-11-15T10:00:00Z') });

      const response = await ctx.app.inject({ method: 'GET', url: `${API}/events/export.ics`, headers: admin.headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.headers['content-disposition']).toContain('calendario.ics');

      const text = response.body;
      expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:')).toBe(true);
      expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
      expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
      for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);

      const unfolded = text.replaceAll('\r\n ', '');
      expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(2);
      expect(unfolded.match(/END:VEVENT/g)).toHaveLength(2);
      expect(unfolded).toContain(`UID:${match.id}@suiteasd`);
      expect(unfolded).toContain('DTSTART:20261114T193000Z');
      expect(unfolded).toContain('DTEND:20261114T213000Z');
      expect(unfolded).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
      expect(unfolded).toContain('SUMMARY:Aquile\\; Delfini\\, finale\\\\ultima');
      expect(unfolded).toContain('LOCATION:Palestra "Nord"\\, Via Roma 1\\, Bologna');
      expect(unfolded).toContain('DESCRIPTION:Prima riga\\nSeconda riga molto lunga');
      expect(unfolded).toContain('STATUS:CANCELLED');
      expect(unfolded).toContain('STATUS:CONFIRMED');
    });

    it('applies the same filters as the list and only exports the caller society', async () => {
      const week = await createSociety(ctx, 'Filtro ics');
      const admin = await createActor(ctx, week.id, 'ADMIN');
      await createEvent(ctx, week.id, { title: 'Dentro', startsAt: new Date('2026-11-10T18:00:00Z') });
      await createEvent(ctx, week.id, { title: 'Fuori', startsAt: new Date('2026-12-10T18:00:00Z') });
      const filtered = await ctx.app.inject({
        method: 'GET',
        url: `${API}/events/export.ics?from=${encodeURIComponent('2026-11-01T00:00:00Z')}&to=${encodeURIComponent('2026-12-01T00:00:00Z')}`,
        headers: admin.headers,
      });
      expect(filtered.body).toContain('SUMMARY:Dentro');
      expect(filtered.body).not.toContain('SUMMARY:Fuori');
      expect(filtered.body).not.toContain('Aquile Volley vs Delfini Volley');
    });
  });

  describe('tenant isolation', () => {
    it('answers 404 for events of another society and never lists or exports them', async () => {
      const event = await createEvent(ctx, societyId, { title: 'Riservato ai nostri' });
      const read = await send('GET', outsider, `/events/${event.id}`);
      const update = await send('PATCH', outsider, `/events/${event.id}`, { title: 'Hack' });
      const cancel = await send('POST', outsider, `/events/${event.id}/cancel`, {});
      const remove = await send('DELETE', outsider, `/events/${event.id}`);
      expect([read, update, cancel, remove].map((response) => response.statusCode)).toEqual([404, 404, 404, 404]);

      const list = await send('GET', outsider, '/events?limit=100');
      expect(list.json().data.map((item: { id: string }) => item.id)).not.toContain(event.id);
      expect((await send('GET', outsider, '/events/export.ics')).body).not.toContain('Riservato ai nostri');
      expect((await send('GET', actors.ADMIN, `/events/${event.id}`)).statusCode).toBe(200);
    });

    it('does not accept a team or venue of another society', async () => {
      const foreignTeam = await createTeam(ctx, outsider.societyId, 'Altrui');
      const response = await send('POST', actors.ADMIN, '/events', body({ teamId: foreignTeam.id }));
      expect(response.statusCode).toBe(404);
    });

    it('creates the event in the token society even if the body names another one', async () => {
      const response = await send('POST', outsider, '/events', {
        type: 'MEETING',
        title: 'Riunione',
        startsAt: inDays(3).toISOString(),
        societyId,
      });
      expect(response.statusCode).toBe(201);
      expect(await ctx.prisma.event.findUniqueOrThrow({ where: { id: response.json().id } })).toMatchObject({ societyId: outsider.societyId });
    });
  });
});
