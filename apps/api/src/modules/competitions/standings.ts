import type { Tiebreaker } from '../../shared/enums.js';

// Standings are DERIVED data (SPEC 05): this pure function is the only place that computes them.
// No I/O and no clock, so the result depends only on its input and is fully unit-tested.

// Points by final set score, written "<winner sets>-<loser sets>" -> [winner points, loser points].
export type PointsRules = Record<string, readonly [number, number]>;

// Volleyball: 3-0 and 3-1 give 3 points to the winner; 3-2 gives 2 to the winner and 1 to the loser.
export const DEFAULT_POINTS_RULES: PointsRules = {
  '3-0': [3, 0],
  '3-1': [3, 0],
  '3-2': [2, 1],
};

// After points: more wins, then set quotient, then points quotient.
export const DEFAULT_TIEBREAKERS: readonly Tiebreaker[] = ['WINS', 'SET_RATIO', 'POINT_RATIO'];

export interface StandingsTeam {
  id: string;
  name: string;
  // Set when the participant is one of the society's own teams.
  teamId: string | null;
}

// Only matches with a recorded result belong here.
export interface StandingsMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeSets: number;
  awaySets: number;
  // One [home, away] pair per set, when recorded.
  setScores: readonly (readonly [number, number])[] | null;
}

export interface StandingRow {
  position: number;
  groupTeamId: string;
  name: string;
  teamId: string | null;
  isOurTeam: boolean;
  points: number;
  played: number;
  won: number;
  lost: number;
  setsFor: number;
  setsAgainst: number;
  // null when the denominator is 0 (a ratio that would be infinite or undefined; JSON cannot carry Infinity).
  setRatio: number | null;
  pointsFor: number;
  pointsAgainst: number;
  pointRatio: number | null;
}

interface Tally {
  team: StandingsTeam;
  points: number;
  played: number;
  won: number;
  lost: number;
  setsFor: number;
  setsAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
}

function pointsFor(rules: PointsRules, winnerSets: number, loserSets: number): readonly [number, number] {
  const key = `${winnerSets}-${loserSets}`;
  const entry = rules[key];
  if (!entry) throw new RangeError(`The points rules define no points for the score ${key}`);
  return entry;
}

// Orders "for / against" quotients without dividing, so 0 denominators stay well defined:
// no data at all (0/0) < any finite quotient < "never conceded" (x/0, ordered by x).
// Returns a negative number when `a` ranks ahead of `b`.
function compareQuotients(aFor: number, aAgainst: number, bFor: number, bAgainst: number): number {
  const kind = (value: number, against: number) => (against === 0 ? (value === 0 ? 0 : 2) : 1);
  const kindA = kind(aFor, aAgainst);
  const kindB = kind(bFor, bAgainst);
  if (kindA !== kindB) return kindB - kindA;
  if (kindA === 0) return 0;
  if (kindA === 2) return bFor - aFor;
  return bFor * aAgainst - aFor * bAgainst;
}

const TIEBREAKER_COMPARATORS: Record<Tiebreaker, (a: Tally, b: Tally) => number> = {
  WINS: (a, b) => b.won - a.won,
  SET_RATIO: (a, b) => compareQuotients(a.setsFor, a.setsAgainst, b.setsFor, b.setsAgainst),
  POINT_RATIO: (a, b) => compareQuotients(a.pointsFor, a.pointsAgainst, b.pointsFor, b.pointsAgainst),
};

function ratio(value: number, against: number): number | null {
  return against === 0 ? null : value / against;
}

export function computeStandings(input: {
  teams: readonly StandingsTeam[];
  matches: readonly StandingsMatch[];
  rules: PointsRules;
  tiebreakers: readonly Tiebreaker[];
}): StandingRow[] {
  const tallies = new Map<string, Tally>(
    input.teams.map((team) => [
      team.id,
      { team, points: 0, played: 0, won: 0, lost: 0, setsFor: 0, setsAgainst: 0, pointsFor: 0, pointsAgainst: 0 },
    ]),
  );

  for (const match of input.matches) {
    const home = tallies.get(match.homeTeamId);
    const away = tallies.get(match.awayTeamId);
    // A result for a participant that is not in the group cannot contribute.
    if (!home || !away) continue;

    const homeWon = match.homeSets > match.awaySets;
    const [winnerPoints, loserPoints] = pointsFor(
      input.rules,
      Math.max(match.homeSets, match.awaySets),
      Math.min(match.homeSets, match.awaySets),
    );
    home.points += homeWon ? winnerPoints : loserPoints;
    away.points += homeWon ? loserPoints : winnerPoints;

    for (const [side, won, setsFor, setsAgainst] of [
      [home, homeWon, match.homeSets, match.awaySets],
      [away, !homeWon, match.awaySets, match.homeSets],
    ] as const) {
      side.played += 1;
      if (won) side.won += 1;
      else side.lost += 1;
      side.setsFor += setsFor;
      side.setsAgainst += setsAgainst;
    }

    for (const [homePoints, awayPoints] of match.setScores ?? []) {
      home.pointsFor += homePoints;
      home.pointsAgainst += awayPoints;
      away.pointsFor += awayPoints;
      away.pointsAgainst += homePoints;
    }
  }

  const comparators = input.tiebreakers.map((rule) => TIEBREAKER_COMPARATORS[rule]);
  const ordered = [...tallies.values()].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    // Last resort keeps the order deterministic whatever the input order was.
    return a.team.name.localeCompare(b.team.name, 'it') || (a.team.id < b.team.id ? -1 : a.team.id > b.team.id ? 1 : 0);
  });

  return ordered.map((tally, index) => ({
    position: index + 1,
    groupTeamId: tally.team.id,
    name: tally.team.name,
    teamId: tally.team.teamId,
    isOurTeam: tally.team.teamId !== null,
    points: tally.points,
    played: tally.played,
    won: tally.won,
    lost: tally.lost,
    setsFor: tally.setsFor,
    setsAgainst: tally.setsAgainst,
    setRatio: ratio(tally.setsFor, tally.setsAgainst),
    pointsFor: tally.pointsFor,
    pointsAgainst: tally.pointsAgainst,
    pointRatio: ratio(tally.pointsFor, tally.pointsAgainst),
  }));
}
