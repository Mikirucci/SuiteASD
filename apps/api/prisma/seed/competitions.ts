import type { SeedStep } from './context.js';

// SPEC section 6: Serie D, girone B. Final table: Aquile Volley 32 (after the 3-1 over Delfini), Falchi Volley 31,
// Delfini Volley 30, Leoni Volley 24, Tigri Volley 19. Standings are derived from the matches, so the data below is
// a real double round robin played twice (4 legs, 40 matches) whose results add up to exactly those points.
//
// A fixed table of results was needed because with the standard volleyball scoring every match hands out exactly
// 3 points, and the SPEC totals (136) are not a multiple of 3. The competition therefore uses the rule "3-2: 3 points
// to the winner, 1 to the loser" (stored in `pointsRules`, so the standings code needs no special case).

const TEAM_NAMES = ['Aquile Volley', 'Falchi Volley', 'Delfini Volley', 'Leoni Volley', 'Tigri Volley'] as const;
const OUR_TEAM_INDEX = 0;

// [round, home index, away index, home sets, away sets] in the order of TEAM_NAMES. The last one is the
// featured match: Aquile Volley 3-1 Delfini Volley.
const RESULTS: readonly (readonly [number, number, number, number, number])[] = [
  [1, 1, 4, 3, 0], [1, 2, 3, 3, 0],
  [2, 0, 4, 3, 2], [2, 1, 2, 3, 2],
  [3, 0, 3, 3, 2], [3, 2, 4, 3, 0],
  [4, 2, 0, 3, 2], [4, 1, 3, 3, 2],
  [5, 0, 1, 3, 2], [5, 3, 4, 3, 0],
  [6, 4, 1, 1, 3], [6, 3, 2, 1, 3],
  [7, 4, 0, 1, 3], [7, 2, 1, 2, 3],
  [8, 3, 0, 3, 2], [8, 4, 2, 3, 1],
  [9, 0, 2, 3, 2], [9, 3, 1, 2, 3],
  [10, 1, 0, 2, 3], [10, 4, 3, 1, 3],
  [11, 1, 4, 3, 0], [11, 2, 3, 3, 0],
  [12, 0, 4, 0, 3], [12, 1, 2, 0, 3],
  [13, 0, 3, 2, 3], [13, 2, 4, 0, 3],
  [14, 2, 0, 3, 2], [14, 1, 3, 3, 0],
  [15, 0, 1, 3, 2], [15, 3, 4, 3, 0],
  [16, 4, 1, 1, 3], [16, 3, 2, 1, 3],
  [17, 4, 0, 3, 1], [17, 2, 1, 3, 1],
  [18, 3, 0, 3, 2], [18, 4, 2, 3, 1],
  [19, 1, 0, 2, 3], [19, 4, 3, 3, 1],
  [20, 0, 2, 3, 1], [20, 3, 1, 3, 1],
];

// Saturday 14 November 2026, 20:30 in Rome: the match of the calendar card; it ends around 22:15.
const FEATURED_PLAYED_AT = new Date('2026-11-14T21:15:00.000Z');

// Report cards of the featured match (SPEC 06): Giulia Rossi 8,5 and MVP, then two more Serie D players.
// [rating, attacks, aces, blocks]
const GIULIA_ROSSI = 'Giulia Rossi';
const REPORT_CARDS: readonly (readonly [number, number, number, number])[] = [
  [8.5, 18, 3, 2],
  [8, 14, 1, 1],
  [7.5, 6, 2, 0],
  [7, 9, 0, 3],
];

export const seedCompetitions: SeedStep = async (context) => {
  const { prisma, societyId } = context;
  const serieD = context.teamIds['Serie D'];
  if (!serieD) throw new Error('Team "Serie D" must be seeded before the competitions');

  const season = await prisma.season.create({
    data: {
      societyId,
      name: '2026/27',
      startsOn: new Date(Date.UTC(2026, 8, 1)),
      endsOn: new Date(Date.UTC(2027, 5, 30)),
      isCurrent: true,
    },
  });
  const competition = await prisma.competition.create({
    data: {
      societyId,
      seasonId: season.id,
      name: 'Serie D',
      kind: 'LEAGUE',
      pointsRules: { '3-0': [3, 0], '3-1': [3, 0], '3-2': [3, 1] },
    },
  });
  const group = await prisma.group.create({ data: { societyId, competitionId: competition.id, name: 'Girone B' } });

  const groupTeamIds: string[] = [];
  for (const [index, name] of TEAM_NAMES.entries()) {
    const groupTeam = await prisma.groupTeam.create({
      data: { societyId, groupId: group.id, name, teamId: index === OUR_TEAM_INDEX ? serieD : null },
    });
    groupTeamIds.push(groupTeam.id);
  }

  let featuredMatchId: string | null = null;
  for (const [index, [round, home, away, homeSets, awaySets]] of RESULTS.entries()) {
    const homeTeamId = groupTeamIds[home];
    const awayTeamId = groupTeamIds[away];
    if (!homeTeamId || !awayTeamId) throw new Error(`Unknown participant in result ${index}`);
    const isFeatured = index === RESULTS.length - 2;
    const match = await prisma.match.create({
      data: {
        societyId,
        groupId: group.id,
        round,
        homeTeamId,
        awayTeamId,
        homeSets,
        awaySets,
        status: 'PLAYED',
        ...(isFeatured ? { playedAt: FEATURED_PLAYED_AT } : {}),
      },
    });
    if (isFeatured) featuredMatchId = match.id;
  }
  if (!featuredMatchId) throw new Error('The featured match is missing from the results table');

  await seedReportCards(context, serieD, featuredMatchId);
};

async function seedReportCards(context: Parameters<SeedStep>[0], serieD: string, matchId: string): Promise<void> {
  const { prisma, societyId } = context;
  const giulia = context.memberIds[GIULIA_ROSSI];
  if (!giulia) throw new Error(`Demo member ${GIULIA_ROSSI} is missing`);
  // The other cards go to players of the same team, so every card belongs to somebody who played the match.
  const teammates = await prisma.member.findMany({
    where: { societyId, id: { not: giulia }, teamMemberships: { some: { teamId: serieD, leftAt: null } } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    take: REPORT_CARDS.length - 1,
  });
  const players = [giulia, ...teammates.map((member) => member.id)];

  for (const [index, [rating, attackPoints, aces, blocks]] of REPORT_CARDS.entries()) {
    const memberId = players[index];
    if (!memberId) throw new Error('The Serie D roster is too small for the demo report cards');
    await prisma.playerEvaluation.create({
      data: {
        societyId,
        matchId,
        memberId,
        authorId: context.users.allenatore.id,
        rating,
        notes: index === 0 ? 'Partita di grande continuita in attacco e in ricezione.' : null,
        isMvp: index === 0,
        publishedAt: new Date(FEATURED_PLAYED_AT.getTime() + 60 * 60 * 1000),
      },
    });
    await prisma.playerMatchStats.create({ data: { societyId, matchId, memberId, attackPoints, aces, blocks } });
  }
}
