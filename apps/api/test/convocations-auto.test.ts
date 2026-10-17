import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convocationDispatch } from '../src/jobs/definitions/convocation-dispatch.js';
import { runAutomation } from '../src/jobs/runner.js';
import { scopeToTenant } from '../src/lib/tenant.js';
import { sendConvocations } from '../src/modules/convocations/service.js';
import { createDefaultDocumentTypes } from '../src/lib/society-defaults.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { addCertificate, createAthlete, createEvent, inDays, type Athlete } from './helpers/calendar.js';
import { createActor, createSociety, createTeam, type Actor } from './helpers/factories.js';

// D-32: the athletes of the team can answer as soon as the event exists (no "send" step needed).
describe('automatic convocations (D-32)', () => {
  let ctx: TestContext;
  let societyId: string;
  let teamId: string;
  let admin: Actor;
  let coach: Actor;
  let outsider: Actor;

  const send = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', actor: Actor | null, path: string, body?: object) =>
    ctx.app.inject({ method, url: `${API}${path}`, headers: actor?.headers, payload: body });
  const newEvent = async (overrides: object = {}, actor: Actor = coach) => {
    const response = await send('POST', actor, '/events', {
      type: 'MATCH',
      title: 'Aquile Volley vs Delfini Volley',
      startsAt: inDays(10, 19).toISOString(),
      teamId,
      ...overrides,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string; occurrencesCreated: number }>();
  };
  const rowsOf = (eventId: string) => ctx.prisma.convocation.findMany({ where: { eventId } });
  const memberIdsOf = async (eventId: string) => (await rowsOf(eventId)).map((row) => row.memberId).sort();
  const sorted = (...athletes: Athlete[]) => athletes.map((athlete) => athlete.member.id).sort();
  const squadMember = (accounts: { athlete?: boolean; guardian?: boolean } = {}, team = teamId) =>
    createAthlete(ctx, societyId, team, accounts);
  const respond = (actor: Actor | null, id: string, body: object = { status: 'CONFIRMED' }) =>
    send('PUT', actor, `/convocations/${id}/response`, body);
  const scope = () => ({ db: scopeToTenant(ctx.prisma, societyId), societyId });

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Risposte')).id;
    await createDefaultDocumentTypes(ctx.prisma, societyId);
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altra Societa Risposte')).id, 'ADMIN');
    admin = await createActor(ctx, societyId, 'ADMIN');
    coach = await createActor(ctx, societyId, 'ALLENATORE');
    teamId = (await createTeam(ctx, societyId, 'Serie D')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('creating an event', () => {
    it('convocates the eligible active members of the team and nobody else', async () => {
      const [fine, validCertificate, noCertificate] = [await squadMember(), await squadMember(), await squadMember()];
      await addCertificate(ctx, societyId, validCertificate.member.id, 120);
      const expired = await squadMember();
      await addCertificate(ctx, societyId, expired.member.id, -3);
      const inactive = await createAthlete(ctx, societyId, teamId, {}, { status: 'INACTIVE' });
      const left = await squadMember();
      await ctx.prisma.teamMembership.updateMany({ where: { memberId: left.member.id }, data: { leftAt: new Date() } });
      const elsewhere = await squadMember({}, (await createTeam(ctx, societyId)).id);
      const stranger = await createAthlete(ctx, outsider.societyId, (await createTeam(ctx, outsider.societyId)).id);

      const event = await newEvent();
      const rows = await rowsOf(event.id);
      const wanted = new Set(sorted(fine, validCertificate, noCertificate));
      for (const memberId of wanted) expect(rows.map((row) => row.memberId)).toContain(memberId);
      const unwanted = [expired, inactive, left, elsewhere, stranger].map((athlete) => athlete.member.id);
      for (const memberId of unwanted) expect(rows.map((row) => row.memberId)).not.toContain(memberId);
      expect(rows.every((row) => row.status === 'PENDING' && row.sentAt === null && row.overrideReason === null)).toBe(true);
      expect(await ctx.prisma.convocation.count({ where: { memberId: stranger.member.id } })).toBe(0);

      // The summary keeps its shape: nobody confirmed yet, the automatic rows do not consume the slots.
      const summary = (await send('GET', coach, `/events/${event.id}/convocations`)).json().summary;
      expect(summary).toMatchObject({ confirmed: 0, declined: 0, pending: rows.length, total: rows.length, capacity: 12 });
    });

    it('does not convocate anybody for an event without a team', async () => {
      await squadMember();
      const event = await newEvent({ teamId: undefined, type: 'MEETING', title: 'Riunione dei genitori' });
      expect(await rowsOf(event.id)).toEqual([]);
    });

    it('keeps an expired-certificate athlete convocable by hand with an ADMIN override', async () => {
      const expired = await squadMember();
      await addCertificate(ctx, societyId, expired.member.id, -1);
      const event = await newEvent();
      const response = await send('POST', admin, `/events/${event.id}/convocations`, {
        memberIds: [expired.member.id],
        override: { reason: 'Visita fatta, documento in arrivo' },
      });
      expect(response.statusCode).toBe(201);
      expect(await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id, memberId: expired.member.id } })).toMatchObject({
        status: 'PENDING',
        overriddenById: admin.user.id,
      });
    });

    it('convocates the team for every occurrence of a recurring training', async () => {
      const [first, second] = [await squadMember(), await squadMember()];
      const left = await squadMember();
      await ctx.prisma.teamMembership.updateMany({ where: { memberId: left.member.id }, data: { leftAt: new Date() } });
      const created = await newEvent({ type: 'TRAINING', title: 'Allenamento', recurrence: { frequency: 'WEEKLY', count: 3 } });
      expect(created.occurrencesCreated).toBe(3);

      const series = await ctx.prisma.event.findMany({ where: { OR: [{ id: created.id }, { recurrenceParentId: created.id }] } });
      expect(series).toHaveLength(3);
      for (const event of series) {
        const memberIds = await memberIdsOf(event.id);
        expect(memberIds).toEqual(expect.arrayContaining(sorted(first, second)));
        expect(memberIds).not.toContain(left.member.id);
      }
    });

    it('convocates the team for the events imported from an iCalendar file, and nobody without a team', async () => {
      const member = await squadMember();
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'SUMMARY:Allenamento importato', 'DTSTART:20371104T180000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const withTeam = await send('POST', admin, '/events/import', { ics, teamId, dryRun: false });
      expect(withTeam.json()).toMatchObject({ created: 1 });
      const imported = await ctx.prisma.event.findFirstOrThrow({ where: { societyId, title: 'Allenamento importato', teamId } });
      expect(await memberIdsOf(imported.id)).toContain(member.member.id);

      const noTeam = await send('POST', admin, '/events/import', { ics: ics.replace('20371104', '20371105'), dryRun: false });
      expect(noTeam.json()).toMatchObject({ created: 1 });
      const free = await ctx.prisma.event.findFirstOrThrow({ where: { societyId, title: 'Allenamento importato', teamId: null } });
      expect(await rowsOf(free.id)).toEqual([]);
    });
  });

  describe('answering', () => {
    it('lets the athlete and the guardian answer at once, with nothing ever sent', async () => {
      const mine = await squadMember({ athlete: true, guardian: true });
      const event = await newEvent();
      const row = await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id, memberId: mine.member.id } });
      expect(row.sentAt).toBeNull();

      const own = await send('GET', mine.athlete, `/convocations?eventId=${event.id}`);
      expect(own.json().data.map((item: { member: { id: string } }) => item.member.id)).toEqual([mine.member.id]);
      const confirmed = await respond(mine.athlete, row.id);
      expect(confirmed.statusCode).toBe(200);
      expect(confirmed.json()).toMatchObject({ status: 'CONFIRMED', sentAt: null });
      const declined = await respond(mine.guardian, row.id, { status: 'DECLINED', reason: 'Gita scolastica' });
      expect(declined.json()).toMatchObject({ status: 'DECLINED', declineReason: 'Gita scolastica' });

      const summary = (await send('GET', coach, `/events/${event.id}/convocations`)).json().summary;
      expect(summary.declined).toBe(1);
      expect(summary.confirmed).toBe(0);
    });

    it('does not show an athlete the convocations of the others, nor let them answer', async () => {
      const [mine, other] = [await squadMember({ athlete: true }), await squadMember({ athlete: true })];
      const event = await newEvent();
      const otherRow = await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id, memberId: other.member.id } });

      const list = await send('GET', mine.athlete, `/events/${event.id}/convocations`);
      expect(list.json().data.map((item: { member: { id: string } }) => item.member.id)).toEqual([mine.member.id]);
      expect(list.json().summary.total).toBeGreaterThan(1);
      expect((await respond(mine.athlete, otherRow.id)).statusCode).toBe(404);
      expect(await ctx.prisma.convocation.findUniqueOrThrow({ where: { id: otherRow.id } })).toMatchObject({ status: 'PENDING' });
    });

    it('refuses answers for events already started or cancelled', async () => {
      const mine = await squadMember({ athlete: true });
      const [started, cancelled] = [await newEvent(), await newEvent()];
      await ctx.prisma.event.update({ where: { id: started.id }, data: { startsAt: new Date(Date.now() - 60_000) } });
      await send('POST', admin, `/events/${cancelled.id}/cancel`, {});

      for (const [event, code] of [
        [started, 'event_started'],
        [cancelled, 'event_cancelled'],
      ] as const) {
        const row = await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id, memberId: mine.member.id } });
        const response = await respond(mine.athlete, row.id);
        expect(response.statusCode, code).toBe(409);
        expect(response.json()).toMatchObject({ code });
      }
    });

    it('keeps the athletes who have not answered on the attendance sheet of a training', async () => {
      const silent = await squadMember();
      const training = await newEvent({ type: 'TRAINING', title: 'Allenamento aperto' });
      const sheet = await send('GET', coach, `/events/${training.id}/attendance`);
      expect(sheet.statusCode).toBe(200);
      expect(sheet.json().data.map((row: { member: { id: string } }) => row.member.id)).toContain(silent.member.id);
    });

    it('keeps an account of another society out (404)', async () => {
      const mine = await squadMember({ athlete: true });
      const event = await newEvent();
      const row = await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id, memberId: mine.member.id } });
      const foreign = await createActor(ctx, outsider.societyId, 'ATLETA');
      expect((await respond(foreign, row.id)).statusCode).toBe(404);
      expect((await send('GET', outsider, `/events/${event.id}/convocations`)).statusCode).toBe(404);
    });
  });

  describe('joining and leaving a team', () => {
    it('adds the pending rows of the future events when a member joins, and removes them when they leave', async () => {
      const otherTeam = await createTeam(ctx, societyId);
      const [future, cancelled, past, otherTeamEvent] = [
        await newEvent(),
        await newEvent(),
        await createEvent(ctx, societyId, { teamId, startsAt: inDays(-3) }),
        await newEvent({ teamId: otherTeam.id }),
      ];
      await send('POST', admin, `/events/${cancelled.id}/cancel`, {});

      const created = await send('POST', admin, '/members', { firstName: 'Nuova', lastName: 'Arrivata', teamIds: [teamId] });
      expect(created.statusCode).toBe(201);
      const memberId: string = created.json().id;
      const has = async (eventId: string) => (await memberIdsOf(eventId)).includes(memberId);
      expect(await has(future.id)).toBe(true);
      expect(await has(cancelled.id)).toBe(false);
      expect(await has(past.id)).toBe(false);
      expect(await has(otherTeamEvent.id)).toBe(false);

      // Answers already given survive; the unanswered rows of the future events go, the past ones stay.
      const another = await newEvent();
      await ctx.prisma.convocation.updateMany({ where: { eventId: future.id, memberId }, data: { status: 'CONFIRMED' } });
      await ctx.prisma.convocation.create({ data: { societyId, eventId: past.id, memberId } });
      const left = await send('PATCH', admin, `/members/${memberId}`, { teamIds: [] });
      expect(left.statusCode).toBe(200);
      expect(await has(future.id)).toBe(true);
      expect(await has(another.id)).toBe(false);
      expect(await has(past.id)).toBe(true);

      const back = await send('PATCH', admin, `/members/${memberId}`, { teamIds: [teamId] });
      expect(back.statusCode).toBe(200);
      expect(await has(another.id)).toBe(true);
      expect(await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: future.id, memberId } })).toMatchObject({ status: 'CONFIRMED' });
    });

    it('does not convocate a joining member with an expired certificate', async () => {
      const event = await newEvent();
      const created = await send('POST', admin, '/members', { firstName: 'Scaduta', lastName: 'Certificata' });
      const memberId: string = created.json().id;
      await addCertificate(ctx, societyId, memberId, -2);
      await send('PATCH', admin, `/members/${memberId}`, { teamIds: [teamId] });
      expect(await memberIdsOf(event.id)).not.toContain(memberId);
    });

    it('drops the pending rows of a member who is no longer active, and restores them when they come back', async () => {
      const member = await squadMember();
      const event = await newEvent();
      expect(await memberIdsOf(event.id)).toContain(member.member.id);
      await send('PATCH', admin, `/members/${member.member.id}`, { status: 'INACTIVE' });
      expect(await memberIdsOf(event.id)).not.toContain(member.member.id);
      await send('PATCH', admin, `/members/${member.member.id}`, { status: 'ACTIVE' });
      expect(await memberIdsOf(event.id)).toContain(member.member.id);
    });

    it('works for a member created with a CSV import', async () => {
      const event = await newEvent();
      const csv = 'nome,cognome,squadre\nCsv,Importata,Serie D\n';
      const response = await send('POST', admin, '/members/import', { csv, dryRun: false });
      expect(response.json()).toMatchObject({ created: 1 });
      const member = await ctx.prisma.member.findFirstOrThrow({ where: { societyId, lastName: 'Importata' } });
      expect(await memberIdsOf(event.id)).toContain(member.id);
    });

    it('works for somebody who enrols from a link', async () => {
      const event = await newEvent();
      const link = await send('POST', admin, '/join-links', { teamId });
      const code: string = link.json().code;
      const enrolment = await ctx.app.inject({
        method: 'POST',
        url: `${API}/join/${code}`,
        payload: {
          kind: 'ATLETA',
          account: { email: 'iscritta.da.link@example.test', password: 'Sup3rSegreta!', firstName: 'Linda', lastName: 'Daiscritta' },
          athlete: { birthDate: '2008-03-04', gender: 'FEMALE' },
        },
      });
      expect(enrolment.statusCode).toBe(201);
      const member = await ctx.prisma.member.findFirstOrThrow({ where: { societyId, lastName: 'Daiscritta' } });
      expect(await memberIdsOf(event.id)).toContain(member.id);
    });
  });

  describe('changing the team of an event', () => {
    it('convocates the new team and drops the unanswered rows of the old one', async () => {
      const newTeamId = (await createTeam(ctx, societyId)).id;
      const [oldPending, oldConfirmed, incoming] = [await squadMember(), await squadMember(), await squadMember({}, newTeamId)];
      const event = await newEvent();
      await ctx.prisma.convocation.updateMany({ where: { eventId: event.id, memberId: oldConfirmed.member.id }, data: { status: 'CONFIRMED' } });

      const moved = await send('PATCH', coach, `/events/${event.id}`, { teamId: newTeamId });
      expect(moved.statusCode).toBe(200);
      const memberIds = await memberIdsOf(event.id);
      expect(memberIds).toContain(incoming.member.id);
      expect(memberIds).not.toContain(oldPending.member.id);
      expect(memberIds).toContain(oldConfirmed.member.id);
    });
  });

  describe('notifications', () => {
    it('notifies each pending athlete once, however often the dispatch runs, and not those who already answered', async () => {
      const [silent, answered] = [await squadMember({ athlete: true }), await squadMember({ athlete: true })];
      const event = await newEvent();
      const answeredRow = await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId: event.id, memberId: answered.member.id } });
      expect((await respond(answered.athlete, answeredRow.id)).statusCode).toBe(200);
      const notifications = (user: Actor | null) =>
        ctx.prisma.notification.count({ where: { userId: user?.user.id ?? '', type: 'CONVOCATION', channel: 'IN_APP' } });

      const first = await sendConvocations(scope(), event.id);
      expect(first.sent).toBeGreaterThanOrEqual(2);
      expect(await notifications(silent.athlete)).toBe(1);
      expect(await notifications(answered.athlete)).toBe(0);
      expect(await sendConvocations(scope(), event.id)).toMatchObject({ sent: 0, notified: 0 });
      expect(await notifications(silent.athlete)).toBe(1);
      expect((await rowsOf(event.id)).every((row) => row.sentAt !== null)).toBe(true);
    });

    it('lets the dispatch job notify the events that have unsent rows and remind the notified pending ones', async () => {
      const society = await createSociety(ctx, 'Aquile Job Risposte');
      await createDefaultDocumentTypes(ctx.prisma, society.id);
      const team = await createTeam(ctx, society.id);
      const manager = await createActor(ctx, society.id, 'ADMIN');
      const early = await createAthlete(ctx, society.id, team.id, { athlete: true });
      const startsAt = inDays(1, 19);
      const created = await ctx.app.inject({
        method: 'POST',
        url: `${API}/events`,
        headers: manager.headers,
        payload: { type: 'MATCH', title: 'Partita del job', startsAt: startsAt.toISOString(), teamId: team.id },
      });
      const eventId: string = created.json().id;
      const run = (now: Date) => runAutomation({ prisma: ctx.prisma, definition: convocationDispatch, societyId: society.id, now, log: ctx.app.log, runKey: now.toISOString() });
      const count = () => ctx.prisma.notification.count({ where: { userId: early.athlete?.user.id ?? '', type: 'CONVOCATION', channel: 'IN_APP' } });

      expect(await run(new Date())).toMatchObject({ status: 'SUCCESS', result: { eventsDispatched: 1 } });
      expect(await count()).toBe(1);

      // A member joining later is picked up by the next run, the one already notified is not told again.
      const late = await createAthlete(ctx, society.id, team.id, { athlete: true });
      await send('PATCH', manager, `/members/${late.member.id}`, { teamIds: [team.id] });
      expect(await ctx.prisma.convocation.findFirstOrThrow({ where: { eventId, memberId: late.member.id } })).toMatchObject({ sentAt: null });
      expect(await run(new Date(Date.now() + 1000))).toMatchObject({ status: 'SUCCESS', result: { eventsDispatched: 1 } });
      expect(await ctx.prisma.notification.count({ where: { userId: late.athlete?.user.id ?? '', type: 'CONVOCATION', channel: 'IN_APP' } })).toBe(1);
      expect(await count()).toBe(1);

      // Reminders hit the notified rows that are still pending (the event was notified on an earlier day).
      await ctx.prisma.event.update({ where: { id: eventId }, data: { convocationsSentAt: new Date(Date.now() - 2 * 86_400_000) } });
      await run(new Date(Date.now() + 2000));
      const reminders = await ctx.prisma.notification.count({
        where: { userId: early.athlete?.user.id ?? '', type: 'CONVOCATION', title: 'Promemoria convocazione' },
      });
      expect(reminders).toBeGreaterThan(0);
    });
  });
});
