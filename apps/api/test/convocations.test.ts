import type { Event } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scopeToTenant } from '../src/lib/tenant.js';
import { remindPendingConvocations, sendConvocations } from '../src/modules/convocations/service.js';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { addCertificate, createAthlete, createEvent, inDays, type Athlete } from './helpers/calendar.js';
import { createActor, createSociety, createTeam, type Actor } from './helpers/factories.js';

const DAY_MS = 86_400_000;

describe('convocations (SPEC 04)', () => {
  let ctx: TestContext;
  let societyId: string;
  let teamId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;

  const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', actor: Actor | null, path: string, body?: object) =>
    ctx.app.inject({ method, url: `${API}${path}`, headers: actor?.headers, payload: body });
  const newMatch = (overrides: Partial<Omit<Event, 'id'>> = {}) =>
    createEvent(ctx, societyId, { type: 'MATCH', title: 'Aquile Volley vs Delfini Volley', teamId, startsAt: inDays(10, 19), ...overrides });
  const single = (accounts: { athlete?: boolean; guardian?: boolean } = {}) => createAthlete(ctx, societyId, teamId, accounts);
  const squad = async (size: number, accounts: { athlete?: boolean; guardian?: boolean } = {}) => {
    const members: Athlete[] = [];
    for (let index = 0; index < size; index += 1) members.push(await createAthlete(ctx, societyId, teamId, accounts));
    return members;
  };
  const convoke = (eventId: string, athletes: readonly Athlete[], actor: Actor = actors.ALLENATORE, extra: object = {}) =>
    send('POST', actor, `/events/${eventId}/convocations`, { memberIds: athletes.map((athlete) => athlete.member.id), ...extra });
  const inApp = (userId: string | undefined) =>
    ctx.prisma.notification.findMany({ where: { userId: userId ?? '', channel: 'IN_APP', type: 'CONVOCATION' }, orderBy: { createdAt: 'asc' } });
  const scope = (id = societyId) => ({ db: scopeToTenant(ctx.prisma, id), societyId: id });

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Convocazioni')).id;
    const otherSocietyId = (await createSociety(ctx, 'Altra Societa Convocazioni')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
    teamId = (await createTeam(ctx, societyId, 'Serie D')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('authorization', () => {
    it('answers 401 without a token on every endpoint', async () => {
      const event = await newMatch();
      const calls: [Parameters<typeof send>[0], string][] = [
        ['GET', '/convocations'],
        ['GET', `/events/${event.id}/convocations`],
        ['POST', `/events/${event.id}/convocations`],
        ['POST', `/events/${event.id}/convocations/send`],
        ['POST', `/events/${event.id}/convocations/remind`],
        ['PUT', '/convocations/x/response'],
        ['DELETE', '/convocations/x'],
      ];
      for (const [method, path] of calls) {
        const response = await send(method, null, path);
        expect(response.statusCode, `${method} ${path}`).toBe(401);
        expect(response.headers['content-type']).toContain('application/problem+json');
      }
    });

    it.each(ROLES)('%s follows the role matrix', async (role) => {
      const event = await newMatch();
      const athlete = await single();
      const writer = ['ADMIN', 'ALLENATORE'].includes(role);

      expect((await send('GET', actors[role], '/convocations')).statusCode).toBe(200);
      expect((await send('GET', actors[role], `/events/${event.id}/convocations`)).statusCode).toBe(200);
      expect((await convoke(event.id, [athlete], actors[role])).statusCode).toBe(writer ? 201 : 403);
      expect((await send('POST', actors[role], `/events/${event.id}/convocations/send`)).statusCode).toBe(writer ? 200 : 403);
      expect((await send('POST', actors[role], `/events/${event.id}/convocations/remind`)).statusCode).toBe(writer ? 200 : 403);
      expect((await send('DELETE', actors[role], '/convocations/missing')).statusCode).toBe(writer ? 404 : 403);
      const respond = await send('PUT', actors[role], '/convocations/missing/response', { status: 'CONFIRMED' });
      expect(respond.statusCode).toBe(['ATLETA', 'GENITORE'].includes(role) ? 404 : 403);
    });
  });

  describe('convocating athletes', () => {
    it('convocates team athletes and reports the "5/12 confermate" summary', async () => {
      const event = await newMatch();
      const athletes = await squad(6);
      const response = await convoke(event.id, athletes);
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data).toHaveLength(6);
      expect(body.summary).toEqual({ confirmed: 0, declined: 0, pending: 6, total: 6, capacity: 12 });
      expect(body.data[0]).toMatchObject({ status: 'PENDING', sentAt: null, overrideReason: null, event: { id: event.id, title: event.title } });

      await ctx.prisma.convocation.updateMany({ where: { eventId: event.id, memberId: { in: athletes.slice(0, 5).map((a) => a.member.id) } }, data: { status: 'CONFIRMED' } });
      const read = await send('GET', actors.STAFF, `/events/${event.id}/convocations`);
      expect(read.json().summary).toEqual({ confirmed: 5, declined: 0, pending: 1, total: 6, capacity: 12 });
      const asEvent = await send('GET', actors.ATLETA, `/events/${event.id}`);
      expect(asEvent.json().convocations).toEqual({ confirmed: 5, declined: 0, pending: 1, total: 6, capacity: 12 });
    });

    it('skips athletes that are already convocated', async () => {
      const event = await newMatch();
      const athletes = await squad(3);
      await convoke(event.id, athletes.slice(0, 2));
      const again = await convoke(event.id, athletes);
      expect(again.statusCode).toBe(201);
      expect(again.json().data).toHaveLength(3);
    });

    it('rejects athletes outside the event team, inactive or unknown, and invalid bodies', async () => {
      const event = await newMatch();
      const otherTeam = await createTeam(ctx, societyId);
      const outside = await createAthlete(ctx, societyId, otherTeam.id);
      const left = await createAthlete(ctx, societyId, teamId);
      await ctx.prisma.teamMembership.updateMany({ where: { memberId: left.member.id }, data: { leftAt: new Date() } });
      const inactive = await createAthlete(ctx, societyId, teamId, {}, { status: 'INACTIVE' });

      for (const [athlete, code] of [
        [outside, 'member_not_in_team'],
        [left, 'member_not_in_team'],
        [inactive, 'member_inactive'],
      ] as const) {
        const response = await convoke(event.id, [athlete]);
        expect(response.statusCode, code).toBe(422);
        expect(response.json()).toMatchObject({ code, errors: [{ path: 'memberIds.0' }] });
      }
      expect((await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations`, { memberIds: ['missing'] })).statusCode).toBe(404);
      expect((await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations`, { memberIds: [] })).statusCode).toBe(422);
      const duplicate = await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations`, { memberIds: ['a', 'a'] });
      expect(duplicate.statusCode).toBe(422);
    });

    const setStatus = (eventId: string, athletes: readonly Athlete[], status: 'CONFIRMED' | 'DECLINED') =>
      ctx.prisma.convocation.updateMany({ where: { eventId, memberId: { in: athletes.map((athlete) => athlete.member.id) } }, data: { status } });

    // D-32: the rows of a team event are not slots, only the confirmed athletes take a place (manual additions are checked against them).
    it('enforces the event capacity on the confirmed athletes of a team event, freeing the slot of one who declines', async () => {
      const event = await newMatch({ maxConvocations: 3 });
      const athletes = await squad(5);
      expect((await convoke(event.id, athletes.slice(0, 2))).statusCode).toBe(201);
      await setStatus(event.id, athletes.slice(0, 2), 'CONFIRMED');
      const tooMany = await convoke(event.id, athletes.slice(2, 4));
      expect(tooMany.statusCode).toBe(409);
      expect(tooMany.json()).toMatchObject({ code: 'capacity_exceeded' });
      expect((await send('GET', actors.ALLENATORE, `/events/${event.id}/convocations`)).json().summary.total).toBe(2);

      expect((await convoke(event.id, athletes.slice(2, 3))).statusCode).toBe(201);
      await setStatus(event.id, athletes.slice(2, 3), 'CONFIRMED');
      expect((await convoke(event.id, athletes.slice(3, 4))).statusCode).toBe(409);
      await setStatus(event.id, athletes.slice(0, 1), 'DECLINED');
      expect((await convoke(event.id, athletes.slice(3, 4))).statusCode).toBe(201);
      await setStatus(event.id, athletes.slice(3, 4), 'CONFIRMED');
      expect((await convoke(event.id, athletes.slice(4, 5))).statusCode).toBe(409);
    });

    it('counts every row that is not declined on an event without a team, where all rows are manual', async () => {
      const event = await newMatch({ teamId: null, maxConvocations: 2 });
      const athletes = await squad(4);
      expect((await convoke(event.id, athletes.slice(0, 2))).statusCode).toBe(201);
      expect((await convoke(event.id, athletes.slice(2, 3))).json()).toMatchObject({ code: 'capacity_exceeded' });
      await setStatus(event.id, athletes.slice(0, 1), 'DECLINED');
      expect((await convoke(event.id, athletes.slice(2, 3))).statusCode).toBe(201);
    });

    it('defaults to 12 slots for volleyball', async () => {
      const event = await newMatch();
      const athletes = await squad(13);
      expect((await convoke(event.id, athletes)).statusCode).toBe(409);
      expect((await convoke(event.id, athletes.slice(0, 12))).statusCode).toBe(201);
      await setStatus(event.id, athletes.slice(0, 12), 'CONFIRMED');
      expect((await convoke(event.id, athletes.slice(12))).statusCode).toBe(409);
    });

    it('refuses cancelled and already started events', async () => {
      const athlete = await single();
      const cancelled = await newMatch({ status: 'CANCELLED' });
      const started = await newMatch({ startsAt: new Date(Date.now() - 3_600_000) });
      for (const [event, code] of [
        [cancelled, 'event_cancelled'],
        [started, 'event_started'],
      ] as const) {
        const response = await convoke(event.id, [athlete]);
        expect(response.statusCode, code).toBe(409);
        expect(response.json()).toMatchObject({ code });
      }
    });

    it('removes a convocation before the event starts', async () => {
      const event = await newMatch();
      const athlete = await single();
      const created = (await convoke(event.id, [athlete])).json();
      const id: string = created.data[0].id;
      expect((await send('DELETE', actors.ALLENATORE, `/convocations/${id}`)).statusCode).toBe(204);
      expect((await send('DELETE', actors.ALLENATORE, `/convocations/${id}`)).statusCode).toBe(404);

      const started = await newMatch({ startsAt: new Date(Date.now() - 3_600_000) });
      const row = await ctx.prisma.convocation.create({ data: { societyId, eventId: started.id, memberId: athlete.member.id } });
      expect((await send('DELETE', actors.ALLENATORE, `/convocations/${row.id}`)).json()).toMatchObject({ code: 'event_started' });
    });
  });

  describe('eligibility (expired medical certificate)', () => {
    it('blocks an athlete with an expired certificate, but not one with a valid or no certificate', async () => {
      const event = await newMatch();
      const [expired, valid, none] = [await single(), await single(), await single()];
      await addCertificate(ctx, societyId, expired.member.id, -10);
      await addCertificate(ctx, societyId, valid.member.id, 200);

      const blocked = await convoke(event.id, [expired]);
      expect(blocked.statusCode).toBe(422);
      expect(blocked.json()).toMatchObject({ code: 'member_not_eligible', errors: [{ path: 'memberIds.0', message: 'Medical certificate expired' }] });
      expect((await send('GET', actors.ALLENATORE, `/events/${event.id}/convocations`)).json().data).toHaveLength(0);
      expect((await convoke(event.id, [valid, none])).statusCode).toBe(201);
    });

    it('lets only an ADMIN override with a mandatory reason, stored and hidden from athletes', async () => {
      const event = await newMatch({ title: 'Partita con deroga' });
      const athlete = await createAthlete(ctx, societyId, teamId, { athlete: true });
      await addCertificate(ctx, societyId, athlete.member.id, -1);

      const byCoach = await convoke(event.id, [athlete], actors.ALLENATORE, { override: { reason: 'Visita in corso' } });
      expect(byCoach.statusCode).toBe(403);
      const noReason = await convoke(event.id, [athlete], actors.ADMIN, { override: { reason: '   ' } });
      expect(noReason.statusCode).toBe(422);
      expect((await convoke(event.id, [athlete], actors.ADMIN, { override: {} })).statusCode).toBe(422);
      expect(await ctx.prisma.convocation.count({ where: { eventId: event.id } })).toBe(0);

      const response = await convoke(event.id, [athlete], actors.ADMIN, { override: { reason: 'Certificato rinnovato, in attesa del documento' } });
      expect(response.statusCode).toBe(201);
      expect(response.json().data[0]).toMatchObject({ overrideReason: 'Certificato rinnovato, in attesa del documento' });
      const row = await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id } });
      expect(row).toMatchObject({ overriddenById: actors.ADMIN.user.id, overrideReason: 'Certificato rinnovato, in attesa del documento' });

      expect((await send('GET', actors.ALLENATORE, `/events/${event.id}/convocations`)).json().data[0].overrideReason).not.toBeNull();
      await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations/send`);
      const own = await send('GET', athlete.athlete, `/convocations?eventId=${event.id}`);
      expect(own.json().data[0]).toMatchObject({ overrideReason: null });
    });

    it('does not mark eligible athletes as overridden when an override is sent', async () => {
      const event = await newMatch();
      const fine = await single();
      await convoke(event.id, [fine], actors.ADMIN, { override: { reason: 'Per sicurezza' } });
      const row = await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id } });
      expect(row).toMatchObject({ overriddenById: null, overrideReason: null });
    });
  });

  describe('sending and reminders', () => {
    it('sends the convocations once, notifying athletes and guardians', async () => {
      const event = await newMatch();
      const [withAccounts, athleteOnly, nobody] = [
        await createAthlete(ctx, societyId, teamId, { athlete: true, guardian: true }),
        await createAthlete(ctx, societyId, teamId, { athlete: true }),
        await createAthlete(ctx, societyId, teamId),
      ];
      await convoke(event.id, [withAccounts, athleteOnly, nobody]);

      const first = await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations/send`);
      expect(first.statusCode).toBe(200);
      const result = first.json();
      expect(result).toMatchObject({ eventId: event.id, sent: 3 });
      expect(result.notified).toBeGreaterThanOrEqual(3);
      expect(result.convocationsSentAt).not.toBeNull();

      for (const user of [withAccounts.athlete, withAccounts.guardian, athleteOnly.athlete]) {
        const notifications = await inApp(user?.user.id);
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({ title: 'Convocazione', societyId, status: 'SENT' });
        expect(notifications[0]?.body).toMatch(/^Aquile Volley vs Delfini Volley: \S+ \d{2}:\d{2} · conferma presenza$/);
        expect(notifications[0]?.data).toMatchObject({ eventId: event.id, memberId: expect.any(String) });
      }
      const stored = await ctx.prisma.event.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.convocationsSentAt?.toISOString()).toBe(result.convocationsSentAt);
      expect((await ctx.prisma.convocation.findMany({ where: { eventId: event.id } })).every((row) => row.sentAt !== null)).toBe(true);
    });

    it('is idempotent: a second send changes nothing, a later convocation is sent on its own', async () => {
      const event = await newMatch();
      const [first, second] = [
        await createAthlete(ctx, societyId, teamId, { athlete: true }),
        await createAthlete(ctx, societyId, teamId, { athlete: true }),
      ];
      await convoke(event.id, [first]);
      const sentAt = (await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations/send`)).json().convocationsSentAt;

      const repeat = await send('POST', actors.ADMIN, `/events/${event.id}/convocations/send`);
      expect(repeat.json()).toEqual({ eventId: event.id, sent: 0, notified: 0, convocationsSentAt: sentAt });
      expect(await inApp(first.athlete?.user.id)).toHaveLength(1);

      await convoke(event.id, [second]);
      const late = await send('POST', actors.ADMIN, `/events/${event.id}/convocations/send`);
      expect(late.json()).toMatchObject({ sent: 1, convocationsSentAt: sentAt });
      expect(await inApp(first.athlete?.user.id)).toHaveLength(1);
      expect(await inApp(second.athlete?.user.id)).toHaveLength(1);
    });

    it('can be called by the automations with just the tenant client and the society id', async () => {
      const event = await newMatch();
      const athlete = await createAthlete(ctx, societyId, teamId, { athlete: true });
      await convoke(event.id, [athlete]);

      expect(await sendConvocations(scope(), event.id)).toMatchObject({ eventId: event.id, sent: 1 });
      expect(await sendConvocations(scope(), event.id)).toMatchObject({ sent: 0, notified: 0 });
      expect(await inApp(athlete.athlete?.user.id)).toHaveLength(1);
      await expect(sendConvocations(scope(outsider.societyId), event.id)).rejects.toMatchObject({ status: 404 });
    });

    it('does not send for cancelled or started events, or for an event without convocations', async () => {
      const cancelled = await newMatch({ status: 'CANCELLED' });
      expect((await send('POST', actors.ADMIN, `/events/${cancelled.id}/convocations/send`)).statusCode).toBe(409);
      const started = await newMatch({ startsAt: new Date(Date.now() - 1000) });
      expect((await send('POST', actors.ADMIN, `/events/${started.id}/convocations/remind`)).statusCode).toBe(409);
      const empty = await newMatch();
      const response = await send('POST', actors.ADMIN, `/events/${empty.id}/convocations/send`);
      expect(response.json()).toEqual({ eventId: empty.id, sent: 0, notified: 0, convocationsSentAt: null });
    });

    it('reminds only the athletes who have not answered, at most once a day', async () => {
      const event = await newMatch();
      const [silent, confirmed, declined] = [
        await createAthlete(ctx, societyId, teamId, { athlete: true, guardian: true }),
        await createAthlete(ctx, societyId, teamId, { athlete: true }),
        await createAthlete(ctx, societyId, teamId, { athlete: true }),
      ];
      await convoke(event.id, [silent, confirmed, declined]);
      await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations/send`);
      await ctx.prisma.convocation.updateMany({ where: { eventId: event.id, memberId: confirmed.member.id }, data: { status: 'CONFIRMED' } });
      await ctx.prisma.convocation.updateMany({ where: { eventId: event.id, memberId: declined.member.id }, data: { status: 'DECLINED' } });

      const first = await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations/remind`);
      expect(first.json()).toMatchObject({ eventId: event.id, reminded: 1 });
      const reminders = async (user: Actor | null) =>
        (await inApp(user?.user.id)).filter((notification) => notification.title === 'Promemoria convocazione');
      expect(await reminders(silent.athlete)).toHaveLength(1);
      expect(await reminders(silent.guardian)).toHaveLength(1);
      expect(await reminders(confirmed.athlete)).toHaveLength(0);
      expect(await reminders(declined.athlete)).toHaveLength(0);

      expect((await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations/remind`)).json()).toMatchObject({ reminded: 0, notified: 0 });
      expect(await reminders(silent.athlete)).toHaveLength(1);

      const tomorrow = new Date(Date.now() + DAY_MS);
      expect(await remindPendingConvocations(scope(), event.id, tomorrow)).toMatchObject({ reminded: 1 });
      expect(await reminders(silent.athlete)).toHaveLength(2);
    });

    it('does not remind convocations that were never sent', async () => {
      const event = await newMatch();
      const athlete = await createAthlete(ctx, societyId, teamId, { athlete: true });
      await convoke(event.id, [athlete]);
      expect((await send('POST', actors.ADMIN, `/events/${event.id}/convocations/remind`)).json()).toMatchObject({ reminded: 0 });
      expect(await inApp(athlete.athlete?.user.id)).toHaveLength(0);
    });
  });

  describe('answering (athlete and guardian)', () => {
    async function sentConvocation() {
      const event = await newMatch();
      const athlete = await createAthlete(ctx, societyId, teamId, { athlete: true, guardian: true });
      const other = await createAthlete(ctx, societyId, teamId, { athlete: true, guardian: true });
      await convoke(event.id, [athlete, other]);
      await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations/send`);
      const rows = await ctx.prisma.convocation.findMany({ where: { eventId: event.id } });
      const idOf = (member: Athlete) => rows.find((row) => row.memberId === member.member.id)?.id ?? '';
      return { event, athlete, other, id: idOf(athlete), otherId: idOf(other) };
    }
    const respond = (actor: Actor | null, id: string, body: object) => send('PUT', actor, `/convocations/${id}/response`, body);

    it('lets the athlete confirm and the guardian answer for a linked child', async () => {
      const { event, athlete, id } = await sentConvocation();
      const confirmed = await respond(athlete.athlete, id, { status: 'CONFIRMED' });
      expect(confirmed.statusCode).toBe(200);
      expect(confirmed.json()).toMatchObject({ id, status: 'CONFIRMED', declineReason: null });
      expect(confirmed.json().respondedAt).not.toBeNull();

      const declined = await respond(athlete.guardian, id, { status: 'DECLINED', reason: 'Gara di nuoto' });
      expect(declined.statusCode).toBe(200);
      expect(declined.json()).toMatchObject({ status: 'DECLINED', declineReason: 'Gara di nuoto' });

      const back = await respond(athlete.athlete, id, { status: 'CONFIRMED' });
      expect(back.json()).toMatchObject({ status: 'CONFIRMED', declineReason: null });
      const summary = (await send('GET', actors.ALLENATORE, `/events/${event.id}/convocations`)).json().summary;
      expect(summary).toMatchObject({ confirmed: 1, declined: 0, pending: 1, total: 2, capacity: 12 });
    });

    it('answers 404 to anybody who is not the athlete or a linked guardian', async () => {
      const { athlete, other, id, otherId } = await sentConvocation();
      expect((await respond(other.athlete, id, { status: 'CONFIRMED' })).statusCode).toBe(404);
      expect((await respond(other.guardian, id, { status: 'CONFIRMED' })).statusCode).toBe(404);
      expect((await respond(athlete.athlete, otherId, { status: 'CONFIRMED' })).statusCode).toBe(404);
      expect((await respond(outsider, id, { status: 'CONFIRMED' })).statusCode).toBe(403);
      expect((await respond(actors.ADMIN, id, { status: 'CONFIRMED' })).statusCode).toBe(403);
      const generic = await respond(actors.ATLETA, id, { status: 'CONFIRMED' });
      expect(generic.statusCode).toBe(404);
      expect(await ctx.prisma.convocation.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'PENDING' });
    });

    it('does not let an account of another society answer a convocation (404)', async () => {
      const { id } = await sentConvocation();
      const foreignAthlete = await createActor(ctx, outsider.societyId, 'ATLETA');
      expect((await respond(foreignAthlete, id, { status: 'CONFIRMED' })).statusCode).toBe(404);
    });

    // D-32: `sentAt` only records the notification, the athlete sees and answers the convocation as soon as it exists.
    it('shows convocations that were not sent yet and lets the athlete answer them', async () => {
      const event = await newMatch();
      const athlete = await createAthlete(ctx, societyId, teamId, { athlete: true });
      await convoke(event.id, [athlete]);
      const id = (await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id } })).id;
      expect((await send('GET', athlete.athlete, '/convocations')).json().data.map((row: { id: string }) => row.id)).toEqual([id]);
      expect((await send('GET', athlete.athlete, `/events/${event.id}/convocations`)).json().data).toHaveLength(1);
      const answered = await respond(athlete.athlete, id, { status: 'CONFIRMED' });
      expect(answered.statusCode).toBe(200);
      expect(answered.json()).toMatchObject({ status: 'CONFIRMED', sentAt: null });
    });

    it('validates the answer: a reason is only allowed when declining', async () => {
      const { athlete, id } = await sentConvocation();
      const withReason = await respond(athlete.athlete, id, { status: 'CONFIRMED', reason: 'ok' });
      expect(withReason.statusCode).toBe(422);
      expect(withReason.json().errors.map((error: { path: string }) => error.path)).toContain('reason');
      expect((await respond(athlete.athlete, id, { status: 'PENDING' })).statusCode).toBe(422);
      expect((await respond(athlete.athlete, id, {})).statusCode).toBe(422);
      expect((await respond(athlete.athlete, id, { status: 'DECLINED', reason: 'x'.repeat(301) })).statusCode).toBe(422);
    });

    it('refuses answers once the event has started or was cancelled', async () => {
      const started = await sentConvocation();
      await ctx.prisma.event.update({ where: { id: started.event.id }, data: { startsAt: new Date(Date.now() - 60_000) } });
      const late = await respond(started.athlete.athlete, started.id, { status: 'CONFIRMED' });
      expect(late.statusCode).toBe(409);
      expect(late.json()).toMatchObject({ code: 'event_started' });

      const cancelled = await sentConvocation();
      await send('POST', actors.ADMIN, `/events/${cancelled.event.id}/cancel`, {});
      const response = await respond(cancelled.athlete.athlete, cancelled.id, { status: 'CONFIRMED' });
      expect(response.json()).toMatchObject({ code: 'event_cancelled' });
    });
  });

  describe('listing (ABAC)', () => {
    it('gives staff everything and athletes and guardians only what concerns them', async () => {
      const event = await newMatch({ startsAt: inDays(12, 19) });
      const mine = await createAthlete(ctx, societyId, teamId, { athlete: true, guardian: true });
      const other = await createAthlete(ctx, societyId, teamId, { athlete: true });
      await convoke(event.id, [mine, other]);
      await send('POST', actors.ALLENATORE, `/events/${event.id}/convocations/send`);
      const idsOf = async (actor: Actor | null, query = '') =>
        ((await send('GET', actor, `/convocations?eventId=${event.id}${query}`)).json().data as { member: { id: string } }[]).map((row) => row.member.id);

      expect(await idsOf(actors.ALLENATORE)).toHaveLength(2);
      expect(await idsOf(actors.SEGRETERIA)).toHaveLength(2);
      expect(await idsOf(mine.athlete)).toEqual([mine.member.id]);
      expect(await idsOf(mine.guardian)).toEqual([mine.member.id]);
      expect(await idsOf(other.athlete)).toEqual([other.member.id]);
      expect(await idsOf(actors.ATLETA)).toEqual([]);

      const roster = await send('GET', mine.athlete, `/events/${event.id}/convocations`);
      expect(roster.json().data.map((row: { member: { id: string } }) => row.member.id)).toEqual([mine.member.id]);
      expect(roster.json().summary).toMatchObject({ total: 2 });
    });

    it('filters by status, member and upcoming events, with cursor pagination', async () => {
      const society = await createSociety(ctx, 'Filtri Convocazioni');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const team = await createTeam(ctx, society.id);
      const future = await createEvent(ctx, society.id, { teamId: team.id, startsAt: inDays(5) });
      const past = await createEvent(ctx, society.id, { teamId: team.id, startsAt: inDays(-5) });
      const athletes = [];
      for (let index = 0; index < 3; index += 1) athletes.push(await createAthlete(ctx, society.id, team.id));
      for (const [index, athlete] of athletes.entries()) {
        for (const event of [future, past]) {
          await ctx.prisma.convocation.create({
            data: { societyId: society.id, eventId: event.id, memberId: athlete.member.id, sentAt: new Date(), status: index === 0 ? 'CONFIRMED' : 'PENDING' },
          });
        }
      }
      interface ListBody {
        data: { id: string; event: { id: string } }[];
        page: { nextCursor: string | null };
      }
      const list = async (query: string): Promise<ListBody> =>
        (await ctx.app.inject({ method: 'GET', url: `${API}/convocations?${query}`, headers: admin.headers })).json<ListBody>();

      expect((await list('status=CONFIRMED')).data).toHaveLength(2);
      expect((await list(`memberId=${athletes[1]?.member.id}`)).data).toHaveLength(2);
      expect((await list('upcoming=true')).data.every((row: { event: { id: string } }) => row.event.id === future.id)).toBe(true);
      expect((await list('upcoming=false')).data).toHaveLength(3);

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: { data: { id: string }[]; page: { nextCursor: string | null } } = await list(`limit=4${cursor ? `&cursor=${cursor}` : ''}`);
        seen.push(...page.data.map((row) => row.id));
        cursor = page.page.nextCursor;
        pages += 1;
      } while (cursor);
      expect(pages).toBe(2);
      expect(new Set(seen).size).toBe(6);
    });
  });

  describe('tenant isolation', () => {
    it('answers 404 for events, members and convocations of another society', async () => {
      const event = await newMatch();
      const athlete = await single();
      const created = (await convoke(event.id, [athlete])).json();
      const convocationId: string = created.data[0].id;

      expect((await send('GET', outsider, `/events/${event.id}/convocations`)).statusCode).toBe(404);
      expect((await convoke(event.id, [athlete], outsider)).statusCode).toBe(404);
      expect((await send('POST', outsider, `/events/${event.id}/convocations/send`)).statusCode).toBe(404);
      expect((await send('POST', outsider, `/events/${event.id}/convocations/remind`)).statusCode).toBe(404);
      expect((await send('DELETE', outsider, `/convocations/${convocationId}`)).statusCode).toBe(404);
      expect((await send('GET', outsider, '/convocations?limit=100')).json().data).toEqual([]);

      const foreignEvent = await createEvent(ctx, outsider.societyId, { teamId: (await createTeam(ctx, outsider.societyId)).id });
      expect((await convoke(foreignEvent.id, [athlete])).statusCode).toBe(404);
      expect(await ctx.prisma.convocation.count({ where: { eventId: foreignEvent.id } })).toBe(0);
    });
  });
});
