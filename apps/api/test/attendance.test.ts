import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createAthlete, createEvent, inDays, type Athlete } from './helpers/calendar.js';
import { createActor, createSociety, createTeam, type Actor } from './helpers/factories.js';

const READ_ROLES: readonly Role[] = ['ADMIN', 'SEGRETERIA', 'ALLENATORE'];
const WRITE_ROLES: readonly Role[] = ['ADMIN', 'ALLENATORE'];

describe('attendance (SPEC 04: presenze agli allenamenti)', () => {
  let ctx: TestContext;
  let societyId: string;
  let teamId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;

  const send = (method: 'GET' | 'PUT', actor: Actor | null, path: string, body?: object) =>
    ctx.app.inject({ method, url: `${API}${path}`, headers: actor?.headers, payload: body });
  const training = (daysAgo: number, overrides: Parameters<typeof createEvent>[2] = {}) =>
    createEvent(ctx, societyId, { teamId, startsAt: inDays(-daysAgo, 19), ...overrides });
  const checkIn = (eventId: string, entries: { memberId: string; present: boolean; note?: string | null }[], actor = actors.ALLENATORE) =>
    send('PUT', actor, `/events/${eventId}/attendance`, { entries });
  const rowOf = (sheet: { data: { member: { id: string } }[] }, memberId: string) =>
    sheet.data.find((row) => row.member.id === memberId);
  const single = () => createAthlete(ctx, societyId, teamId);
  const squad = async (size: number, inTeam = teamId) => {
    const athletes: Athlete[] = [];
    for (let index = 0; index < size; index += 1) {
      athletes.push(await createAthlete(ctx, societyId, inTeam, {}, { lastName: `Cognome${String(index).padStart(2, '0')}` }));
    }
    return athletes;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Presenze')).id;
    const otherSocietyId = (await createSociety(ctx, 'Altra Societa Presenze')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
    teamId = (await createTeam(ctx, societyId, 'Serie D')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('answers 401 without a token', async () => {
    const event = await training(1);
    for (const [method, path] of [
      ['GET', `/events/${event.id}/attendance`],
      ['PUT', `/events/${event.id}/attendance`],
      ['GET', '/members/x/attendance'],
      ['GET', `/teams/${teamId}/attendance`],
    ] as const) {
      const response = await send(method, null, path);
      expect(response.statusCode, `${method} ${path}`).toBe(401);
    }
  });

  it.each(ROLES)('%s follows the role matrix', async (role) => {
    const event = await training(1);
    const athlete = await single();
    const entries = [{ memberId: athlete.member.id, present: true }];
    const readStatus = READ_ROLES.includes(role) ? 200 : 403;

    expect((await send('GET', actors[role], `/events/${event.id}/attendance`)).statusCode).toBe(readStatus);
    expect((await send('GET', actors[role], `/members/${athlete.member.id}/attendance`)).statusCode).toBe(readStatus);
    expect((await send('GET', actors[role], `/teams/${teamId}/attendance`)).statusCode).toBe(readStatus);
    expect((await checkIn(event.id, entries, actors[role])).statusCode).toBe(WRITE_ROLES.includes(role) ? 200 : 403);
  });

  describe('check-in', () => {
    it('lists the team roster as not recorded, then records presences in bulk', async () => {
      const team = await createTeam(ctx, societyId, 'Roster');
      const event = await training(1, { teamId: team.id });
      const athletes = await squad(4, team.id);
      const sheet = await send('GET', actors.ALLENATORE, `/events/${event.id}/attendance`);
      expect(sheet.statusCode).toBe(200);
      expect(sheet.json().summary).toEqual({ present: 0, absent: 0, notRecorded: 4 });
      expect(sheet.json().data.map((row: { member: { lastName: string }; present: null }) => [row.member.lastName, row.present])).toEqual(
        athletes.map((athlete) => [athlete.member.lastName, null]),
      );

      const [a, b, c] = athletes as [Athlete, Athlete, Athlete, Athlete];
      const response = await checkIn(event.id, [
        { memberId: a.member.id, present: true },
        { memberId: b.member.id, present: false, note: 'Influenza' },
        { memberId: c.member.id, present: true },
      ]);
      expect(response.statusCode).toBe(200);
      expect(response.json().summary).toEqual({ present: 2, absent: 1, notRecorded: 1 });
      expect(rowOf(response.json(), b.member.id)).toMatchObject({ present: false, note: 'Influenza' });
      expect(rowOf(response.json(), athletes[3]?.member.id ?? '')).toMatchObject({ present: null, note: null });
      expect(await ctx.prisma.attendance.findFirstOrThrow({ where: { eventId: event.id, memberId: a.member.id } })).toMatchObject({
        recordedById: actors.ALLENATORE.user.id,
        societyId,
      });
    });

    it('is idempotent and can correct a mark, keeping or clearing the note', async () => {
      const event = await training(1);
      const athlete = await single();
      const mark = { memberId: athlete.member.id, present: false, note: 'Ritardo' };
      await checkIn(event.id, [mark]);
      await checkIn(event.id, [mark]);
      expect(await ctx.prisma.attendance.count({ where: { eventId: event.id } })).toBe(1);

      const corrected = await checkIn(event.id, [{ memberId: athlete.member.id, present: true }]);
      expect(rowOf(corrected.json(), athlete.member.id)).toMatchObject({ present: true, note: 'Ritardo' });
      const cleared = await checkIn(event.id, [{ memberId: athlete.member.id, present: true, note: null }]);
      expect(rowOf(cleared.json(), athlete.member.id)).toMatchObject({ present: true, note: null });
    });

    it('shows a guest from another team on the sheet', async () => {
      const event = await training(1);
      const guest = await createAthlete(ctx, societyId, (await createTeam(ctx, societyId)).id);
      await checkIn(event.id, [{ memberId: guest.member.id, present: true }]);
      const sheet = await send('GET', actors.ADMIN, `/events/${event.id}/attendance`);
      expect(sheet.json().data.map((row: { member: { id: string } }) => row.member.id)).toContain(guest.member.id);
    });

    it('validates the body and the event', async () => {
      const event = await training(1);
      const athlete = await single();
      const id = athlete.member.id;
      expect((await checkIn(event.id, [])).statusCode).toBe(422);
      expect((await checkIn(event.id, [{ memberId: id, present: true }, { memberId: id, present: false }])).statusCode).toBe(422);
      expect((await send('PUT', actors.ADMIN, `/events/${event.id}/attendance`, { entries: [{ memberId: id }] })).statusCode).toBe(422);
      expect((await checkIn(event.id, [{ memberId: 'missing', present: true }])).statusCode).toBe(404);
      expect((await checkIn('missing', [{ memberId: id, present: true }])).statusCode).toBe(404);
      expect(await ctx.prisma.attendance.count({ where: { eventId: event.id } })).toBe(0);

      const match = await createEvent(ctx, societyId, { type: 'MATCH', teamId });
      const notTraining = await checkIn(match.id, [{ memberId: id, present: true }]);
      expect(notTraining.statusCode).toBe(422);
      expect(notTraining.json()).toMatchObject({ code: 'attendance_not_allowed' });
      const cancelled = await training(1, { status: 'CANCELLED' });
      expect((await checkIn(cancelled.id, [{ memberId: id, present: true }])).json()).toMatchObject({ code: 'event_cancelled' });
    });
  });

  describe('history and percentages', () => {
    it('reports the history of an athlete with the presence percentage, newest first', async () => {
      const athlete = await single();
      const marks = [true, true, false, true];
      const events = [];
      for (const [index, present] of marks.entries()) {
        const event = await training(10 - index);
        await checkIn(event.id, [{ memberId: athlete.member.id, present }]);
        events.push(event);
      }
      // Cancelled trainings and other event types never count.
      const cancelled = await training(1, { status: 'CANCELLED' });
      await ctx.prisma.attendance.create({ data: { societyId, eventId: cancelled.id, memberId: athlete.member.id, present: false } });

      const response = await send('GET', actors.ALLENATORE, `/members/${athlete.member.id}/attendance`);
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.member).toMatchObject({ id: athlete.member.id });
      expect(body.summary).toEqual({ present: 3, total: 4, percentage: 75 });
      expect(body.data.map((row: { eventId: string }) => row.eventId)).toEqual(events.map((event) => event.id).reverse());
      expect(body.data[1]).toMatchObject({ present: false, title: 'Allenamento Serie D' });
      expect(new Date(body.data[0].startsAt).toISOString()).toBe(body.data[0].startsAt);
    });

    it('rounds to one decimal, returns null without records, and filters by period', async () => {
      const athlete = await single();
      const empty = await send('GET', actors.ADMIN, `/members/${athlete.member.id}/attendance`);
      expect(empty.json()).toMatchObject({ summary: { present: 0, total: 0, percentage: null }, data: [] });

      const marks = [true, false, false];
      for (const [index, present] of marks.entries()) {
        const event = await training(40 + index * 10);
        await checkIn(event.id, [{ memberId: athlete.member.id, present }]);
      }
      const all = await send('GET', actors.ADMIN, `/members/${athlete.member.id}/attendance`);
      expect(all.json().summary).toEqual({ present: 1, total: 3, percentage: 33.3 });

      const from = encodeURIComponent(inDays(-45, 0).toISOString());
      const recent = await send('GET', actors.ADMIN, `/members/${athlete.member.id}/attendance?from=${from}`);
      expect(recent.json().summary).toEqual({ present: 1, total: 1, percentage: 100 });
      const to = encodeURIComponent(inDays(-45, 0).toISOString());
      const old = await send('GET', actors.ADMIN, `/members/${athlete.member.id}/attendance?to=${to}`);
      expect(old.json().summary).toEqual({ present: 0, total: 2, percentage: 0 });
    });

    it('paginates the history with the cursor', async () => {
      const athlete = await single();
      const ids: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const event = await training(30 - index);
        await checkIn(event.id, [{ memberId: athlete.member.id, present: true }]);
        ids.push(event.id);
      }
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const response = await send('GET', actors.ADMIN, `/members/${athlete.member.id}/attendance?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
        const body: { data: { eventId: string }[]; summary: { total: number }; page: { nextCursor: string | null } } = response.json();
        expect(body.summary.total).toBe(5);
        seen.push(...body.data.map((row) => row.eventId));
        cursor = body.page.nextCursor;
        pages += 1;
      } while (cursor);
      expect(pages).toBe(3);
      expect(seen).toEqual([...ids].reverse());
      expect((await send('GET', actors.ADMIN, `/members/${athlete.member.id}/attendance?cursor=bad`)).statusCode).toBe(400);
    });

    it('summarises a team: percentage per athlete and overall', async () => {
      const team = await createTeam(ctx, societyId, 'Prima Divisione');
      const [a, b, c] = [
        await createAthlete(ctx, societyId, team.id, {}, { lastName: 'Aaa' }),
        await createAthlete(ctx, societyId, team.id, {}, { lastName: 'Bbb' }),
        await createAthlete(ctx, societyId, team.id, {}, { lastName: 'Ccc' }),
      ];
      const marks: [boolean, boolean][] = [[true, true], [true, false], [false, true], [true, true]];
      for (const [index, [aPresent, bPresent]] of marks.entries()) {
        const event = await training(5 + index, { teamId: team.id });
        await checkIn(event.id, [
          { memberId: a.member.id, present: aPresent },
          { memberId: b.member.id, present: bPresent },
        ]);
      }
      // A training of another team does not count, a cancelled one neither.
      const other = await training(2);
      await checkIn(other.id, [{ memberId: a.member.id, present: false }]);
      const cancelled = await training(3, { teamId: team.id, status: 'CANCELLED' });
      await ctx.prisma.attendance.create({ data: { societyId, eventId: cancelled.id, memberId: a.member.id, present: false } });

      const response = await send('GET', actors.SEGRETERIA, `/teams/${team.id}/attendance`);
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.team).toEqual({ id: team.id, name: 'Prima Divisione' });
      expect(body.trainings).toBe(4);
      expect(body.summary).toEqual({ present: 6, total: 8, percentage: 75 });
      expect(body.members.map((row: { member: { lastName: string } }) => row.member.lastName)).toEqual(['Aaa', 'Bbb', 'Ccc']);
      expect(body.members[0]).toMatchObject({ present: 3, total: 4, percentage: 75 });
      expect(body.members[1]).toMatchObject({ present: 3, total: 4, percentage: 75 });
      expect(body.members[2]).toMatchObject({ member: { id: c.member.id }, present: 0, total: 0, percentage: null });
    });
  });

  describe('tenant isolation', () => {
    it('answers 404 for events, members and teams of another society', async () => {
      const event = await training(1);
      const athlete = await single();
      await checkIn(event.id, [{ memberId: athlete.member.id, present: true }]);

      expect((await send('GET', outsider, `/events/${event.id}/attendance`)).statusCode).toBe(404);
      expect((await checkIn(event.id, [{ memberId: athlete.member.id, present: false }], outsider)).statusCode).toBe(404);
      expect((await send('GET', outsider, `/members/${athlete.member.id}/attendance`)).statusCode).toBe(404);
      expect((await send('GET', outsider, `/teams/${teamId}/attendance`)).statusCode).toBe(404);

      const foreignEvent = await createEvent(ctx, outsider.societyId);
      expect((await checkIn(foreignEvent.id, [{ memberId: athlete.member.id, present: true }], outsider)).statusCode).toBe(404);
      expect(await ctx.prisma.attendance.count({ where: { eventId: foreignEvent.id } })).toBe(0);
      expect(await ctx.prisma.attendance.findFirstOrThrow({ where: { eventId: event.id } })).toMatchObject({ present: true });
    });
  });
});
