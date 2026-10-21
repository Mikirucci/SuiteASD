import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

const dayOffset = (days: number): Date => new Date(`${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`);

describe('plan report (Pagamenti: cards per plan, people inside)', () => {
  let ctx: TestContext;
  let societyId: string;
  let planId: string;
  let emptyPlanId: string;
  let teamId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;

  const get = (actor: Actor | null, url: string) => ctx.app.inject({ method: 'GET', url: `${API}${url}`, headers: actor?.headers });

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Report ASD')).id;
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altra Report ASD')).id, 'ADMIN');
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    teamId = (await createTeam(ctx, societyId, 'Under 14')).id;

    const plan = await ctx.prisma.feePlan.create({ data: { societyId, name: 'Quota annuale', amountCents: 6000 } });
    planId = plan.id;
    emptyPlanId = (await ctx.prisma.feePlan.create({ data: { societyId, name: 'Torneo estivo', amountCents: 2000 } })).id;

    const person = async (lastName: string, fees: { due: number; paid?: boolean; cancelled?: boolean; amount?: number }[], inTeam = false) => {
      const member = await createMember(ctx, societyId, { firstName: 'Atleta', lastName });
      if (inTeam) await ctx.prisma.teamMembership.create({ data: { societyId, teamId, memberId: member.id } });
      for (const [index, fee] of fees.entries()) {
        await ctx.prisma.payment.create({
          data: {
            societyId,
            memberId: member.id,
            feePlanId: plan.id,
            description: `Rata ${index + 1}`,
            amountCents: fee.amount ?? 6000,
            dueDate: dayOffset(fee.due),
            status: fee.paid ? 'PAID' : fee.cancelled ? 'CANCELLED' : 'PENDING',
            paidAt: fee.paid ? new Date() : null,
          },
        });
      }
      return member;
    };
    // Rossi: everything paid. Bianchi: one fee waiting. Verdi: one paid, one late and one waiting. Neri: only cancelled.
    await person('Rossi', [{ due: -20, paid: true }, { due: -5, paid: true }], true);
    await person('Bianchi', [{ due: 10 }]);
    await person('Verdi', [{ due: -30, paid: true, amount: 3000 }, { due: -3, amount: 2500 }, { due: 20, amount: 1000 }], true);
    await person('Neri', [{ due: 5, cancelled: true }]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('is limited to the roles that read payments and to the own society', async () => {
    expect((await get(null, '/fee-plans/report')).statusCode).toBe(401);
    for (const role of ROLES) {
      const expected = role === 'ADMIN' || role === 'SEGRETERIA' ? 200 : 403;
      expect((await get(actors[role], '/fee-plans/report')).statusCode, role).toBe(expected);
      expect((await get(actors[role], `/fee-plans/${planId}/people`)).statusCode, role).toBe(expected);
    }
    expect((await get(outsider, `/fee-plans/${planId}/people`)).statusCode).toBe(404);
    expect((await get(outsider, '/fee-plans/report')).json()).toEqual({ data: [] });
  });

  it('counts collected, to collect and the people settled, waiting or late for each plan', async () => {
    const { data } = (await get(actors.ADMIN, '/fee-plans/report')).json();
    expect(data).toEqual([
      {
        feePlanId: planId,
        incassatoCents: 6000 + 6000 + 3000,
        daIncassareCents: 6000 + 2500 + 1000,
        scadutoCents: 2500,
        paidPeople: 1,
        pendingPeople: 1,
        overduePeople: 1,
      },
    ]);
    expect(data.some((entry: { feePlanId: string }) => entry.feePlanId === emptyPlanId)).toBe(false);
  });

  it('lists the people of a plan by name with what each still has to pay', async () => {
    const body = (await get(actors.SEGRETERIA, `/fee-plans/${planId}/people`)).json();
    expect(body.people.map((person: { memberName: string }) => person.memberName)).toEqual([
      'Atleta Bianchi',
      'Atleta Rossi',
      'Atleta Verdi',
    ]);
    expect(body.people).toMatchObject([
      { status: 'PENDING', totalDueCents: 6000, paidCents: 0, feesCount: 1 },
      { status: 'PAID', totalDueCents: 0, paidCents: 12_000, feesCount: 2, nextDueDate: null },
      { status: 'OVERDUE', totalDueCents: 3500, paidCents: 3000, feesCount: 3 },
    ]);
    expect(body.people[2].nextDueDate).toBe(dayOffset(-3).toISOString().slice(0, 10));
    expect(body.stats).toMatchObject({ paidPeople: 1, pendingPeople: 1, overduePeople: 1 });
  });

  it('narrows the people by name, team and status without changing the figures of the plan', async () => {
    const names = async (query: string) =>
      (await get(actors.ADMIN, `/fee-plans/${planId}/people?${query}`))
        .json<{ people: { memberName: string }[] }>()
        .people.map((person) => person.memberName);
    expect(await names('q=verd')).toEqual(['Atleta Verdi']);
    expect(await names('status=OVERDUE')).toEqual(['Atleta Verdi']);
    expect(await names('status=PAID')).toEqual(['Atleta Rossi']);
    expect(await names(`teamId=${teamId}`)).toEqual(['Atleta Rossi', 'Atleta Verdi']);
    expect(await names(`teamId=${teamId}&status=PENDING`)).toEqual([]);
    const filtered = (await get(actors.ADMIN, `/fee-plans/${planId}/people?q=verd`)).json();
    expect(filtered.stats).toMatchObject({ paidPeople: 1, pendingPeople: 1, overduePeople: 1, incassatoCents: 15_000 });
  });

  it('answers with an empty list for a plan nobody pays yet, and 404 for an unknown plan', async () => {
    const empty = (await get(actors.ADMIN, `/fee-plans/${emptyPlanId}/people`)).json();
    expect(empty.people).toEqual([]);
    expect(empty.stats).toEqual({ incassatoCents: 0, daIncassareCents: 0, scadutoCents: 0, paidPeople: 0, pendingPeople: 0, overduePeople: 0 });
    expect((await get(actors.ADMIN, '/fee-plans/does-not-exist/people')).statusCode).toBe(404);
  });

  it('adds up what each person still owes across every plan, not only the open one', async () => {
    const bianchi = await ctx.prisma.member.findFirstOrThrow({ where: { societyId, lastName: 'Bianchi' } });
    const feeOfOtherPlan = await ctx.prisma.payment.create({
      data: {
        societyId,
        memberId: bianchi.id,
        feePlanId: emptyPlanId,
        description: 'Iscrizione torneo',
        amountCents: 2000,
        dueDate: dayOffset(7),
        status: 'PENDING',
      },
    });
    const { people } = (await get(actors.ADMIN, `/fee-plans/${planId}/people`)).json<{
      people: { memberName: string; totalDueCents: number; allPlansDueCents: number }[];
    }>();
    const figures = people.map((person) => [person.memberName, person.totalDueCents, person.allPlansDueCents]);
    expect(figures).toEqual([
      ['Atleta Bianchi', 6000, 8000],
      ['Atleta Rossi', 0, 0],
      ['Atleta Verdi', 3500, 3500],
    ]);
    await ctx.prisma.payment.delete({ where: { id: feeOfOtherPlan.id } });
  });
});
