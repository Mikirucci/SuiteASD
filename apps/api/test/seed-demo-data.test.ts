import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../prisma/seed/context.js';
import { runSeed } from '../prisma/seed/run.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';

describe('demo seed: standings, fees and secondary modules (SPEC section 6)', () => {
  let ctx: TestContext;
  let societyId: string;

  const get = async (email: string, path: string) => {
    const login = await ctx.app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email, password: DEMO_PASSWORD } });
    const headers = { authorization: `Bearer ${login.json<{ accessToken: string }>().accessToken}` };
    return ctx.app.inject({ method: 'GET', url: `${API}${path}`, headers });
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await runSeed(ctx.prisma, ctx.app.passwords)).societyId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('gives the Serie D girone B the table of the SPEC', async () => {
    const group = await ctx.prisma.group.findFirstOrThrow({ where: { societyId, name: 'Girone B' } });
    const response = await get('admin@aquilevolley.it', `/competitions/${group.competitionId}/groups/${group.id}/standings`);
    expect(response.statusCode).toBe(200);
    const { rows } = response.json<{ rows: { name: string; points: number; isOurTeam: boolean }[] }>();
    expect(rows.map((row) => [row.name, row.points])).toEqual([
      ['Aquile Volley', 32],
      ['Falchi Volley', 31],
      ['Delfini Volley', 30],
      ['Leoni Volley', 24],
      ['Tigri Volley', 19],
    ]);
    expect(rows.filter((row) => row.isOurTeam).map((row) => row.name)).toEqual(['Aquile Volley']);
  });

  it('links the featured 3-1 over Delfini to the calendar match, with Giulia Rossi as MVP', async () => {
    const event = await ctx.prisma.event.findFirstOrThrow({ where: { societyId, type: 'MATCH' } });
    const match = await ctx.prisma.match.findFirstOrThrow({
      where: { eventId: event.id },
      include: { homeTeam: true, awayTeam: true, evaluations: { include: { member: true } } },
    });
    expect([match.homeTeam.name, match.awayTeam.name, match.homeSets, match.awaySets, match.round]).toEqual([
      'Aquile Volley',
      'Delfini Volley',
      3,
      1,
      6,
    ]);
    const mvp = match.evaluations.find((evaluation) => evaluation.isMvp);
    expect([mvp?.member.firstName, mvp?.member.lastName, mvp?.rating]).toEqual(['Giulia', 'Rossi', 8.5]);
  });

  it('bills the 60 EUR November fee, with 240 EUR collected from four receipts', async () => {
    const plan = await ctx.prisma.feePlan.findFirstOrThrow({ where: { societyId, name: 'Quota novembre' } });
    expect(plan.amountCents).toBe(6000);
    const summary = await get('segreteria@aquilevolley.it', '/fees/summary');
    expect(summary.json()).toMatchObject({ incassatoCents: 24000, promemoriaInviati: 4, paidCount: 4 });
  });

  it('fills the secondary modules so no section starts empty', async () => {
    const [venues, staff, kits, sponsors, ledger, trips, announcements, referees] = await Promise.all([
      ctx.prisma.venue.count({ where: { societyId } }),
      ctx.prisma.staffMember.count({ where: { societyId } }),
      ctx.prisma.kit.count({ where: { societyId } }),
      ctx.prisma.sponsor.count({ where: { societyId } }),
      ctx.prisma.ledgerEntry.count({ where: { societyId } }),
      ctx.prisma.trip.count({ where: { societyId } }),
      ctx.prisma.announcement.count({ where: { societyId } }),
      ctx.prisma.referee.count({ where: { societyId } }),
    ]);
    for (const count of [venues, staff, kits, sponsors, ledger, trips, announcements, referees]) expect(count).toBeGreaterThan(0);
  });

  it('is re-runnable with all steps', async () => {
    await runSeed(ctx.prisma, ctx.app.passwords);
    expect(await ctx.prisma.society.count({ where: { slug: 'aquile-volley' } })).toBe(1);
  });
});
