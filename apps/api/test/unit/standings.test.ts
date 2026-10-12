import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POINTS_RULES,
  DEFAULT_TIEBREAKERS,
  computeStandings,
  type StandingsMatch,
  type StandingsTeam,
} from '../../src/modules/competitions/standings.js';

const team = (id: string, isOurs = false): StandingsTeam => ({
  id,
  name: id.toUpperCase(),
  teamId: isOurs ? `team-${id}` : null,
});

const match = (
  homeTeamId: string,
  awayTeamId: string,
  homeSets: number,
  awaySets: number,
  setScores: [number, number][] | null = null,
): StandingsMatch => ({ homeTeamId, awayTeamId, homeSets, awaySets, setScores });

const compute = (teams: StandingsTeam[], matches: StandingsMatch[]) =>
  computeStandings({ teams, matches, rules: DEFAULT_POINTS_RULES, tiebreakers: DEFAULT_TIEBREAKERS });

const pointsOf = (rows: ReturnType<typeof compute>, id: string) => rows.find((row) => row.groupTeamId === id)?.points;

describe('computeStandings: points', () => {
  const teams = [team('a', true), team('b')];

  it.each([
    [3, 0, 3, 0],
    [3, 1, 3, 0],
    [3, 2, 2, 1],
    [0, 3, 0, 3],
    [1, 3, 0, 3],
    [2, 3, 1, 2],
  ])('result %i-%i gives home %i and away %i points (default volleyball rules)', (home, away, expectedHome, expectedAway) => {
    const rows = compute(teams, [match('a', 'b', home, away)]);
    expect(pointsOf(rows, 'a')).toBe(expectedHome);
    expect(pointsOf(rows, 'b')).toBe(expectedAway);
  });

  it('applies custom rules per competition', () => {
    const rows = computeStandings({
      teams,
      matches: [match('a', 'b', 3, 2)],
      rules: { '3-0': [4, 0], '3-1': [3, 0], '3-2': [3, 1] },
      tiebreakers: DEFAULT_TIEBREAKERS,
    });
    expect(pointsOf(rows, 'a')).toBe(3);
    expect(pointsOf(rows, 'b')).toBe(1);
  });

  it('throws for a score missing from the rules (guarded at write time)', () => {
    expect(() =>
      computeStandings({ teams, matches: [match('a', 'b', 3, 2)], rules: { '3-0': [3, 0] }, tiebreakers: [] }),
    ).toThrow(/3-2/);
  });

  it('lists teams without matches with zeros, ranked after teams that scored', () => {
    const rows = compute([team('c'), ...teams], [match('a', 'b', 3, 0)]);
    expect(rows.map((row) => row.groupTeamId)).toEqual(['a', 'b', 'c']);
    expect(rows[2]).toMatchObject({ groupTeamId: 'c', points: 0, played: 0, won: 0, lost: 0, setRatio: null });
  });
});

describe('computeStandings: row statistics', () => {
  it('counts played, won, lost, sets and set points for both sides', () => {
    const rows = compute(
      [team('a', true), team('b')],
      [
        match('a', 'b', 3, 1, [[25, 20], [22, 25], [25, 18], [25, 23]]),
        match('b', 'a', 3, 2, [[25, 20], [20, 25], [25, 22], [20, 25], [15, 12]]),
      ],
    );
    const a = rows.find((row) => row.groupTeamId === 'a');
    const b = rows.find((row) => row.groupTeamId === 'b');
    expect(a).toMatchObject({ played: 2, won: 1, lost: 1, setsFor: 5, setsAgainst: 4, points: 3 + 1, isOurTeam: true });
    expect(b).toMatchObject({ played: 2, won: 1, lost: 1, setsFor: 4, setsAgainst: 5, points: 0 + 2, isOurTeam: false });
    expect(a?.pointsFor).toBe(25 + 22 + 25 + 25 + (20 + 25 + 22 + 25 + 12));
    expect(a?.setRatio).toBeCloseTo(5 / 4);
  });

  it('leaves the point ratio null when set scores were not recorded', () => {
    const rows = compute([team('a'), team('b')], [match('a', 'b', 3, 0)]);
    expect(rows[0]).toMatchObject({ pointsFor: 0, pointsAgainst: 0, pointRatio: null });
  });

  it('leaves the set ratio null for a team that never lost a set (no finite ratio)', () => {
    const rows = compute([team('a'), team('b')], [match('a', 'b', 3, 0)]);
    expect(rows[0]).toMatchObject({ groupTeamId: 'a', setsFor: 3, setsAgainst: 0, setRatio: null });
  });
});

describe('computeStandings: tiebreakers', () => {
  it('breaks a points tie with more wins first', () => {
    const rows = compute(
      [team('a'), team('b'), team('c')],
      [match('a', 'c', 3, 2), match('a', 'c', 3, 2), match('b', 'c', 3, 0), match('c', 'b', 3, 2)],
    );
    // a: 2 + 2 = 4 points with 2 wins; b: 3 + 1 = 4 points with 1 win
    expect(rows.slice(0, 2).map((row) => [row.groupTeamId, row.points, row.won])).toEqual([
      ['a', 4, 2],
      ['b', 4, 1],
    ]);
  });

  it('breaks a tie on points and wins with the set ratio, ranking an unbeaten-in-sets team first', () => {
    const teams = [team('a'), team('b'), team('x'), team('y')];
    const rows = compute(teams, [match('b', 'y', 3, 1), match('a', 'x', 3, 0)]);
    expect(rows.slice(0, 2).map((row) => row.groupTeamId)).toEqual(['a', 'b']);
  });

  it('ranks by set ratio when points and wins are equal and both ratios are finite', () => {
    const teams = [team('a'), team('b'), team('x'), team('y')];
    const rows = compute(teams, [
      match('a', 'x', 3, 1),
      match('b', 'x', 3, 1),
      match('y', 'a', 3, 1),
      match('y', 'b', 3, 0),
    ]);
    // a: 3 pts, sets 4:4 = 1.00; b: 3 pts, sets 3:4 = 0.75
    expect(rows.map((row) => [row.groupTeamId, row.points])).toEqual([
      ['y', 6],
      ['a', 3],
      ['b', 3],
      ['x', 0],
    ]);
  });

  it('breaks a full tie on points, wins and sets with the point ratio', () => {
    const teams = [team('a'), team('b'), team('x'), team('y')];
    const rows = compute(teams, [
      match('b', 'y', 3, 0, [[25, 20], [25, 20], [25, 20]]),
      match('a', 'x', 3, 0, [[25, 10], [25, 10], [25, 10]]),
    ]);
    expect(rows.slice(0, 2).map((row) => row.groupTeamId)).toEqual(['a', 'b']);
  });

  it('honours a custom tiebreaker order', () => {
    const teams = [team('a'), team('b'), team('x'), team('y')];
    const matches = [
      match('a', 'x', 3, 0, [[25, 22], [25, 22], [25, 22]]),
      match('b', 'y', 3, 0, [[25, 5], [25, 5], [25, 5]]),
    ];
    const rows = computeStandings({ teams, matches, rules: DEFAULT_POINTS_RULES, tiebreakers: ['POINT_RATIO'] });
    expect(rows.slice(0, 2).map((row) => row.groupTeamId)).toEqual(['b', 'a']);
  });

  it('falls back to the team name so equal teams are always ordered the same way', () => {
    const rows = compute([team('b'), team('a')], []);
    expect(rows.map((row) => row.groupTeamId)).toEqual(['a', 'b']);
    expect(rows.map((row) => row.position)).toEqual([1, 2]);
  });
});

describe('computeStandings: a result that overtakes the leader', () => {
  it('moves the winner above the leader when the extra 3 points are added', () => {
    const teams = [team('falchi'), team('delfini'), team('aquile', true)];
    const base = [match('falchi', 'delfini', 3, 0), match('aquile', 'delfini', 3, 2)];
    expect(compute(teams, base).map((row) => row.groupTeamId)).toEqual(['falchi', 'aquile', 'delfini']);
    const after = compute(teams, [...base, match('aquile', 'falchi', 3, 1)]);
    expect(after[0]).toMatchObject({ groupTeamId: 'aquile', position: 1, points: 5, isOurTeam: true });
  });
});

// Deterministic PRNG: the properties below must be reproducible.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLeague(random: () => number) {
  const size = 3 + Math.floor(random() * 5);
  const teams = Array.from({ length: size }, (_, index) => team(`t${index}`, index === 0));
  const matches: StandingsMatch[] = [];
  const count = Math.floor(random() * 30);
  for (let index = 0; index < count; index += 1) {
    const home = Math.floor(random() * size);
    const away = (home + 1 + Math.floor(random() * (size - 1))) % size;
    const loserSets = Math.floor(random() * 3);
    const homeWins = random() < 0.5;
    matches.push(match(`t${home}`, `t${away}`, homeWins ? 3 : loserSets, homeWins ? loserSets : 3));
  }
  return { teams, matches };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

describe('computeStandings: properties (seeded random leagues)', () => {
  const seeds = Array.from({ length: 150 }, (_, seed) => seed);

  it('is independent of the order of teams and matches', () => {
    for (const seed of seeds) {
      const random = mulberry32(seed);
      const { teams, matches } = randomLeague(random);
      const expected = compute(teams, matches);
      expect(compute(shuffled(teams, random), shuffled(matches, random)), `seed ${seed}`).toEqual(expected);
    }
  });

  it('is sorted by points descending with positions 1..n', () => {
    for (const seed of seeds) {
      const { teams, matches } = randomLeague(mulberry32(seed));
      const rows = compute(teams, matches);
      expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index + 1));
      for (let index = 1; index < rows.length; index += 1) {
        expect(rows[index - 1]?.points ?? 0, `seed ${seed}`).toBeGreaterThanOrEqual(rows[index]?.points ?? 0);
      }
    }
  });

  it('conserves points (3 per match with default rules) and keeps played = won + lost', () => {
    for (const seed of seeds) {
      const { teams, matches } = randomLeague(mulberry32(seed));
      const rows = compute(teams, matches);
      expect(
        rows.reduce((sum, row) => sum + row.points, 0),
        `seed ${seed}`,
      ).toBe(matches.length * 3);
      for (const row of rows) expect(row.played).toBe(row.won + row.lost);
      expect(rows.reduce((sum, row) => sum + row.setsFor, 0)).toBe(rows.reduce((sum, row) => sum + row.setsAgainst, 0));
    }
  });
});
