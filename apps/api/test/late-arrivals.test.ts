import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultDocumentTypes } from '../src/lib/society-defaults.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { addCertificate, createAthlete, inDays } from './helpers/calendar.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

// Everything set up before somebody arrives applies to them too: the upcoming events of their team and the fees of
// the plans that target them, whichever way they come in (D-48).
describe('late arrivals get what was set up before them', () => {
  let ctx: TestContext;
  let societyId: string;
  let admin: Actor;
  let outsider: Actor;
  let counter = 0;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Arrivi')).id;
    await createDefaultDocumentTypes(ctx.prisma, societyId);
    admin = await createActor(ctx, societyId, 'ADMIN');
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altra Arrivi')).id, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const send = (method: 'GET' | 'POST' | 'PATCH', actor: Actor, path: string, body?: object) =>
    ctx.app.inject({ method, url: `${API}${path}`, headers: actor.headers, payload: body });
  const day = (offset: number) => inDays(offset).toISOString().slice(0, 10);
  const uniqueName = () => `Arrivo${(counter += 1)}`;

  async function emptyTeam(name = uniqueName()) {
    return createTeam(ctx, societyId, name);
  }

  // A plan created BEFORE anybody is in its teams: it has no fees, only its schedule.
  async function newPlan(teamIds: string[], dueDates: string[], name = uniqueName(), actor = admin) {
    const response = await send('POST', actor, '/fee-plans', { name, amountCents: 5000, teamIds, dueDates });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string; name: string }>();
  }

  const feesOf = async (memberId: string, planId?: string) =>
    (await ctx.prisma.payment.findMany({ where: { memberId, ...(planId ? { feePlanId: planId } : {}) }, orderBy: { dueDate: 'asc' } })).map(
      (fee) => ({ description: fee.description, due: fee.dueDate.toISOString().slice(0, 10), status: fee.status }),
    );
  const dueDatesOf = async (memberId: string, planId: string) => (await feesOf(memberId, planId)).map((fee) => fee.due);

  async function teamEvent(teamId: string) {
    const response = await send('POST', admin, '/events', {
      type: 'TRAINING',
      title: 'Allenamento',
      startsAt: inDays(5, 19).toISOString(),
      teamId,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>().id;
  }
  const convocatedIn = async (eventId: string) => (await ctx.prisma.convocation.findMany({ where: { eventId } })).map((row) => row.memberId);

  describe('every way of arriving', () => {
    const schedule = () => [day(10), day(40), day(70)];

    it('a member created by the secretary, straight into the team', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], schedule());
      const event = await teamEvent(team.id);
      const created = await send('POST', admin, '/members', { firstName: 'Nuova', lastName: 'Arrivata', teamIds: [team.id] });
      const memberId = created.json<{ id: string }>().id;

      expect(await dueDatesOf(memberId, plan.id)).toEqual(schedule());
      expect(await convocatedIn(event)).toContain(memberId);
    });

    it('a member who already existed and is put in the team afterwards', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], schedule());
      const member = await createMember(ctx, societyId, { firstName: 'Gia', lastName: uniqueName() });
      expect(await feesOf(member.id)).toEqual([]);

      await send('PATCH', admin, `/members/${member.id}`, { teamIds: [team.id] });
      expect(await dueDatesOf(member.id, plan.id)).toEqual(schedule());
    });

    it('a member added from the page of the team', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], schedule());
      const event = await teamEvent(team.id);
      const member = await createMember(ctx, societyId, { firstName: 'Aggiunta', lastName: uniqueName() });

      const response = await send('POST', admin, `/teams/${team.id}/members`, { memberIds: [member.id] });
      expect(response.json()).toMatchObject({ added: 1 });
      expect(await dueDatesOf(member.id, plan.id)).toEqual(schedule());
      expect(await convocatedIn(event)).toContain(member.id);
    });

    it('a member imported from a CSV file', async () => {
      const team = await emptyTeam('Squadra CSV');
      const plan = await newPlan([team.id], schedule());
      const event = await teamEvent(team.id);

      const response = await send('POST', admin, '/members/import', { csv: 'nome,cognome,squadre\nCsv,Importato,Squadra CSV\n', dryRun: false });
      expect(response.json()).toMatchObject({ created: 1 });
      const member = await ctx.prisma.member.findFirstOrThrow({ where: { societyId, lastName: 'Importato' } });
      expect(await dueDatesOf(member.id, plan.id)).toEqual(schedule());
      expect(await convocatedIn(event)).toContain(member.id);
    });

    it('somebody who enrols from the link of the team', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], schedule());
      const event = await teamEvent(team.id);
      const link = await send('POST', admin, '/join-links', { teamId: team.id });
      const enrolment = await ctx.app.inject({
        method: 'POST',
        url: `${API}/join/${link.json<{ code: string }>().code}`,
        payload: {
          kind: 'ATLETA',
          account: { email: `${uniqueName().toLowerCase()}@example.test`, password: 'Sup3rSegreta!', firstName: 'Linda', lastName: 'Dailink' },
          athlete: { birthDate: '2008-03-04', gender: 'FEMALE' },
        },
      });
      expect(enrolment.statusCode).toBe(201);
      const member = await ctx.prisma.member.findFirstOrThrow({ where: { societyId, lastName: 'Dailink', firstName: 'Linda' } });

      expect(await dueDatesOf(member.id, plan.id)).toEqual(schedule());
      expect(await convocatedIn(event)).toContain(member.id);
    });

    it('a member who becomes active again', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], schedule());
      const event = await teamEvent(team.id);
      const created = await send('POST', admin, '/members', { firstName: 'Ferma', lastName: uniqueName(), teamIds: [team.id], status: 'INACTIVE' });
      const memberId = created.json<{ id: string }>().id;
      expect(await feesOf(memberId)).toEqual([]);
      expect(await convocatedIn(event)).not.toContain(memberId);

      await send('PATCH', admin, `/members/${memberId}`, { status: 'ACTIVE' });
      expect(await dueDatesOf(memberId, plan.id)).toEqual(schedule());
      expect(await convocatedIn(event)).toContain(memberId);
    });

    it('a child registered by a guardian, who has no team yet', async () => {
      const plan = await newPlan([], schedule());
      const guardian = await createActor(ctx, societyId, 'GENITORE');
      const response = await send('POST', guardian, '/me/children', {
        firstName: 'Figlio',
        lastName: uniqueName(),
        birthDate: '2014-05-06',
        relation: 'PADRE',
      });
      expect(response.statusCode).toBe(201);
      expect(await dueDatesOf(response.json<{ id: string }>().id, plan.id)).toEqual(schedule());
    });

    it('a plan for the whole society reaches a member who is in no team at all', async () => {
      const plan = await newPlan([], schedule());
      const created = await send('POST', admin, '/members', { firstName: 'Senza', lastName: uniqueName() });
      expect(await dueDatesOf(created.json<{ id: string }>().id, plan.id)).toEqual(schedule());
    });
  });

  describe('what a newcomer owes', () => {
    it('the installments still ahead, never the ones that were due before they came', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], [day(-60), day(-30), day(10)]);
      const created = await send('POST', admin, '/members', { firstName: 'Marzo', lastName: uniqueName(), teamIds: [team.id] });

      expect(await feesOf(created.json<{ id: string }>().id, plan.id)).toEqual([
        { description: `${plan.name} · rata 3 di 3`, due: day(10), status: 'PENDING' },
      ]);
    });

    it('the last installment, due today, when the whole plan is already behind (a one-off is never skipped)', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], [day(-5)]);
      const created = await send('POST', admin, '/members', { firstName: 'Tardi', lastName: uniqueName(), teamIds: [team.id] });

      expect(await feesOf(created.json<{ id: string }>().id, plan.id)).toEqual([{ description: plan.name, due: day(0), status: 'PENDING' }]);
    });

    it('a plan that still has dates all ahead bills every installment', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], [day(1), day(31)]);
      const created = await send('POST', admin, '/members', { firstName: 'Presto', lastName: uniqueName(), teamIds: [team.id] });
      expect(await dueDatesOf(created.json<{ id: string }>().id, plan.id)).toEqual([day(1), day(31)]);
    });
  });

  describe('nothing is billed twice or to the wrong people', () => {
    it('leaving and coming back to the team does not repeat the fees, and a member in two teams of the plan pays once', async () => {
      const first = await emptyTeam();
      const second = await emptyTeam();
      const plan = await newPlan([first.id, second.id], [day(10), day(40)]);
      const created = await send('POST', admin, '/members', { firstName: 'Doppia', lastName: uniqueName(), teamIds: [first.id, second.id] });
      const memberId = created.json<{ id: string }>().id;
      expect(await feesOf(memberId, plan.id)).toHaveLength(2);

      await send('PATCH', admin, `/members/${memberId}`, { teamIds: [second.id] });
      await send('PATCH', admin, `/members/${memberId}`, { teamIds: [first.id, second.id] });
      await send('PATCH', admin, `/members/${memberId}`, { status: 'INACTIVE' });
      await send('PATCH', admin, `/members/${memberId}`, { status: 'ACTIVE' });
      expect(await feesOf(memberId, plan.id)).toHaveLength(2);
    });

    it('keeps what a member already paid when they come back', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], [day(10)]);
      const member = (await send('POST', admin, '/members', { firstName: 'Paga', lastName: uniqueName(), teamIds: [team.id] })).json<{ id: string }>();
      await ctx.prisma.payment.updateMany({ where: { memberId: member.id }, data: { status: 'PAID', paidAt: new Date(), method: 'CASH' } });

      await send('PATCH', admin, `/members/${member.id}`, { teamIds: [] });
      await send('PATCH', admin, `/members/${member.id}`, { teamIds: [team.id] });
      expect(await feesOf(member.id, plan.id)).toEqual([{ description: plan.name, due: day(10), status: 'PAID' }]);
    });

    it('does not bill a team the plan is not for, a plan that is off, or another society', async () => {
      const mine = await emptyTeam();
      const other = await emptyTeam();
      const plan = await newPlan([mine.id], [day(10)]);
      const off = await newPlan([other.id], [day(10)]);
      await send('PATCH', admin, `/fee-plans/${off.id}`, { isActive: false });
      const foreign = await newPlan([], [day(10)], uniqueName(), outsider);

      const created = await send('POST', admin, '/members', { firstName: 'Altrove', lastName: uniqueName(), teamIds: [other.id] });
      const memberId = created.json<{ id: string }>().id;
      expect(await feesOf(memberId, plan.id)).toEqual([]);
      expect(await feesOf(memberId, off.id)).toEqual([]);
      expect(await feesOf(memberId, foreign.id)).toEqual([]);
    });

    it('does not bill a team that has not arrived yet to the people already in the society', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], [day(10)]);
      const bystander = await createMember(ctx, societyId, { firstName: 'Fermo', lastName: uniqueName() });
      await send('PATCH', admin, `/members/${bystander.id}`, { notes: 'unrelated change' });
      expect(await feesOf(bystander.id, plan.id)).toEqual([]);
    });
  });

  describe('switching a plan back on', () => {
    it('bills the people who arrived while it was off', async () => {
      const team = await emptyTeam();
      const plan = await newPlan([team.id], [day(10), day(40)]);
      await send('PATCH', admin, `/fee-plans/${plan.id}`, { isActive: false });
      const created = await send('POST', admin, '/members', { firstName: 'Durante', lastName: uniqueName(), teamIds: [team.id] });
      const memberId = created.json<{ id: string }>().id;
      expect(await feesOf(memberId, plan.id)).toEqual([]);

      await send('PATCH', admin, `/fee-plans/${plan.id}`, { isActive: true });
      expect(await dueDatesOf(memberId, plan.id)).toEqual([day(10), day(40)]);

      // and switching it on a second time changes nothing
      await send('PATCH', admin, `/fee-plans/${plan.id}`, { isActive: false });
      await send('PATCH', admin, `/fee-plans/${plan.id}`, { isActive: true });
      expect(await feesOf(memberId, plan.id)).toHaveLength(2);
    });
  });

  describe('a certificate that expired kept the athlete out of the events', () => {
    it('a new valid certificate brings them into the events already scheduled', async () => {
      const team = await emptyTeam();
      const event = await teamEvent(team.id);
      const athlete = await createAthlete(ctx, societyId, team.id);
      await addCertificate(ctx, societyId, athlete.member.id, -10);
      // the roster was aligned when they joined: with an expired certificate they were left out
      await send('PATCH', admin, `/members/${athlete.member.id}`, { status: 'INACTIVE' });
      await send('PATCH', admin, `/members/${athlete.member.id}`, { status: 'ACTIVE' });
      expect(await convocatedIn(event)).not.toContain(athlete.member.id);

      const type = await ctx.prisma.documentType.findFirstOrThrow({ where: { societyId, key: 'MEDICAL_CERTIFICATE' } });
      const uploaded = await send('POST', admin, `/members/${athlete.member.id}/documents`, { documentTypeId: type.id, expiresAt: day(300) });
      expect(uploaded.statusCode).toBe(201);
      expect(await convocatedIn(event)).toContain(athlete.member.id);
    });

    it('removing the expired certificate also lets them in', async () => {
      const team = await emptyTeam();
      const event = await teamEvent(team.id);
      const athlete = await createAthlete(ctx, societyId, team.id);
      await addCertificate(ctx, societyId, athlete.member.id, -10);
      await send('PATCH', admin, `/members/${athlete.member.id}`, { status: 'INACTIVE' });
      await send('PATCH', admin, `/members/${athlete.member.id}`, { status: 'ACTIVE' });
      expect(await convocatedIn(event)).not.toContain(athlete.member.id);

      const document = await ctx.prisma.document.findFirstOrThrow({ where: { memberId: athlete.member.id } });
      const removed = await ctx.app.inject({ method: 'DELETE', url: `${API}/documents/${document.id}`, headers: admin.headers });
      expect(removed.statusCode).toBe(204);
      expect(await convocatedIn(event)).toContain(athlete.member.id);
    });
  });
});
