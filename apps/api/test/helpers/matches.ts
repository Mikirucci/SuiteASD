import type { TestContext } from './app.js';

// A match of a group with two teams (round 6), optionally with the calendar event that gives it its date.
export async function createMatch(ctx: TestContext, societyId: string, eventStart?: Date) {
  const season = await ctx.prisma.season.create({
    data: { societyId, name: `Stagione ${Math.random()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
  });
  const competition = await ctx.prisma.competition.create({ data: { societyId, seasonId: season.id, name: 'Serie D' } });
  const group = await ctx.prisma.group.create({ data: { societyId, competitionId: competition.id, name: 'Girone B' } });
  const home = await ctx.prisma.groupTeam.create({ data: { societyId, groupId: group.id, name: 'Aquile' } });
  const away = await ctx.prisma.groupTeam.create({ data: { societyId, groupId: group.id, name: 'Delfini' } });
  const event = eventStart
    ? await ctx.prisma.event.create({ data: { societyId, type: 'MATCH', title: 'Aquile - Delfini', startsAt: eventStart } })
    : null;
  return ctx.prisma.match.create({
    data: { societyId, groupId: group.id, homeTeamId: home.id, awayTeamId: away.id, round: 6, eventId: event?.id ?? null },
  });
}
