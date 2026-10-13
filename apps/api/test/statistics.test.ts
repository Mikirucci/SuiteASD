import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

const DAY_MS = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);
const midnight = (days: number) => {
  const date = daysFromNow(days);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

describe('statistics overview (SPEC "Statistiche")', () => {
  let ctx: TestContext;
  let societyId: string;
  const actors = {} as Record<Role, Actor>;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Statistiche ASD')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const overview = (actor: Actor | null) => ctx.app.inject({ method: 'GET', url: `${API}/statistics/overview`, headers: actor?.headers });

  it('answers 401 without a token and follows the role matrix', async () => {
    expect((await overview(null)).statusCode).toBe(401);
    for (const role of ROLES) {
      expect((await overview(actors[role])).statusCode, role).toBe(role === 'ADMIN' || role === 'SEGRETERIA' ? 200 : 403);
    }
  });

  it('is empty-but-complete for a society without data', async () => {
    const empty = await createActor(ctx, (await createSociety(ctx, 'Vuota ASD')).id, 'ADMIN');
    expect((await overview(empty)).json()).toEqual({
      members: { total: 0, byTeam: [] },
      certificates: { OK: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 },
      fees: { collectedCents: 0, toCollectCents: 0, overdueCents: 0, remindersSent: 0 },
      attendance: { averagePercent: null, recordsCount: 0 },
      upcomingEvents: [],
      latestResults: [],
    });
  });

  it('computes every figure from the existing data, for its own society only', async () => {
    const society = await createSociety(ctx, 'Dati ASD');
    const other = await createSociety(ctx, 'Altri dati ASD');
    const admin = await createActor(ctx, society.id, 'ADMIN');
    const teamA = await createTeam(ctx, society.id, 'U16');
    const teamB = await createTeam(ctx, society.id, 'Serie D');
    const members = await Promise.all(
      ['Anna', 'Bea', 'Cora', 'Dora'].map((firstName) => createMember(ctx, society.id, { firstName, lastName: 'Test' })),
    );
    const retired = await createMember(ctx, society.id, { firstName: 'Ex', status: 'INACTIVE' });
    const [anna, bea, cora, dora] = members;
    if (!anna || !bea || !cora || !dora) throw new Error('members not created');
    for (const [team, member] of [[teamA, anna], [teamA, bea], [teamB, cora], [teamB, retired]] as const) {
      await ctx.prisma.teamMembership.create({ data: { societyId: society.id, teamId: team.id, memberId: member.id } });
    }
    await createMember(ctx, other.id);

    // Certificates: Anna ok, Bea expiring, Cora expired, Dora has none.
    const type = await ctx.prisma.documentType.create({
      data: { societyId: society.id, key: 'MEDICAL_CERTIFICATE', name: 'Certificato medico', requiresExpiry: true },
    });
    for (const [member, days] of [[anna, 200], [bea, 10], [cora, -4]] as const) {
      await ctx.prisma.document.create({
        data: { societyId: society.id, memberId: member.id, documentTypeId: type.id, expiresAt: midnight(days) },
      });
    }
    // Bea also has an older, expired certificate: only the latest counts.
    await ctx.prisma.document.create({
      data: { societyId: society.id, memberId: bea.id, documentTypeId: type.id, expiresAt: midnight(-300) },
    });

    // Fees: 60 EUR paid, 60 EUR pending, 40 EUR overdue (with 2 reminders).
    const fee = (memberId: string, amountCents: number, dueDays: number, extra: object = {}) =>
      ctx.prisma.payment.create({
        data: { societyId: society.id, memberId, description: 'Quota', amountCents, dueDate: midnight(dueDays), ...extra },
      });
    await fee(anna.id, 6000, -10, { status: 'PAID', paidAt: new Date(), method: 'CASH' });
    await fee(bea.id, 6000, 20);
    await fee(cora.id, 4000, -5, { reminderCount: 2 });

    // Attendance at trainings in the window: 3 present out of 4; an old and a non-training record are ignored.
    const training = (days: number, type = 'TRAINING') =>
      ctx.prisma.event.create({ data: { societyId: society.id, type, title: 'Allenamento', startsAt: daysFromNow(days) } });
    const recent = await training(-3);
    const older = await training(-10);
    const ancient = await training(-200);
    const matchEvent = await training(-2, 'MATCH');
    for (const [event, member, present] of [
      [recent, anna, true],
      [recent, bea, true],
      [recent, cora, false],
      [older, anna, true],
      [ancient, anna, false],
      [matchEvent, anna, false],
    ] as const) {
      await ctx.prisma.attendance.create({ data: { societyId: society.id, eventId: event.id, memberId: member.id, present } });
    }

    // Next events (cancelled and past ones excluded) and latest results.
    await ctx.prisma.event.create({ data: { societyId: society.id, type: 'MATCH', title: 'Aquile - Delfini', startsAt: daysFromNow(5), teamId: teamB.id } });
    await ctx.prisma.event.create({ data: { societyId: society.id, type: 'TRAINING', title: 'Allenamento giovedi', startsAt: daysFromNow(2) } });
    await ctx.prisma.event.create({ data: { societyId: society.id, type: 'MEETING', title: 'Annullata', startsAt: daysFromNow(1), status: 'CANCELLED' } });

    const season = await ctx.prisma.season.create({
      data: { societyId: society.id, name: '2026/27', startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
    });
    const competition = await ctx.prisma.competition.create({ data: { societyId: society.id, seasonId: season.id, name: 'Serie D' } });
    const group = await ctx.prisma.group.create({ data: { societyId: society.id, competitionId: competition.id, name: 'Girone B' } });
    const ours = await ctx.prisma.groupTeam.create({ data: { societyId: society.id, groupId: group.id, name: 'Aquile', teamId: teamB.id } });
    const delfini = await ctx.prisma.groupTeam.create({ data: { societyId: society.id, groupId: group.id, name: 'Delfini' } });
    const falchi = await ctx.prisma.groupTeam.create({ data: { societyId: society.id, groupId: group.id, name: 'Falchi' } });
    const played = (homeTeamId: string, awayTeamId: string, homeSets: number, awaySets: number, days: number) =>
      ctx.prisma.match.create({
        data: { societyId: society.id, groupId: group.id, homeTeamId, awayTeamId, homeSets, awaySets, status: 'PLAYED', playedAt: daysFromNow(days) },
      });
    await played(ours.id, delfini.id, 3, 1, -7);
    await played(falchi.id, ours.id, 3, 2, -1);
    await played(delfini.id, falchi.id, 3, 0, -2); // none of our teams: not a result of ours

    const body = (await overview(admin)).json();
    expect(body.members).toEqual({
      total: 4,
      byTeam: [
        { teamId: teamB.id, teamName: 'Serie D', count: 1 },
        { teamId: teamA.id, teamName: 'U16', count: 2 },
      ],
    });
    expect(body.certificates).toEqual({ OK: 1, EXPIRING: 1, EXPIRED: 1, MISSING: 1 });
    expect(body.fees).toEqual({ collectedCents: 6000, toCollectCents: 10_000, overdueCents: 4000, remindersSent: 2 });
    expect(body.attendance).toEqual({ averagePercent: 75, recordsCount: 4 });
    expect(body.upcomingEvents.map((event: { title: string }) => event.title)).toEqual(['Allenamento giovedi', 'Aquile - Delfini']);
    expect(body.upcomingEvents[1]).toMatchObject({ type: 'MATCH', teamName: 'Serie D' });
    expect(body.latestResults.map((result: { homeTeam: string; awayTeam: string; homeSets: number; awaySets: number }) => [
      result.homeTeam, result.awayTeam, result.homeSets, result.awaySets,
    ])).toEqual([
      ['Falchi', 'Aquile', 3, 2],
      ['Aquile', 'Delfini', 3, 1],
    ]);
    expect(body.latestResults[0]).toMatchObject({ competitionName: 'Serie D' });

    // The other society sees none of it.
    const outsider = await createActor(ctx, other.id, 'ADMIN');
    const foreign = (await overview(outsider)).json();
    expect(foreign.members.total).toBe(1);
    expect(foreign.fees.collectedCents).toBe(0);
    expect(foreign.latestResults).toEqual([]);
  });
});
