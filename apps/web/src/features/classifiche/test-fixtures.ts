import type { Competition, Group, GroupTeam, Match, Season, Standings, StandingRow } from "./types";

const STAMP = "2026-09-01T08:00:00.000Z";

export const SEASON: Season = {
  id: "s1",
  name: "2026/27",
  startsOn: "2026-09-01T00:00:00.000Z",
  endsOn: "2027-06-30T00:00:00.000Z",
  isCurrent: true,
  createdAt: STAMP,
  updatedAt: STAMP,
};

export const COMPETITION: Competition = {
  id: "c1",
  seasonId: "s1",
  name: "Serie D femminile",
  kind: "LEAGUE",
  sport: "VOLLEY",
  pointsRules: { "3-0": [3, 0], "3-1": [3, 0], "3-2": [2, 1] },
  tiebreakers: ["WINS", "SET_RATIO", "POINT_RATIO"],
  groupsCount: 1,
  createdAt: STAMP,
  updatedAt: STAMP,
};

export const GROUP: Group = {
  id: "g1",
  competitionId: "c1",
  name: "Girone B",
  teamsCount: 5,
  matchesCount: 3,
  createdAt: STAMP,
  updatedAt: STAMP,
};

function team(id: string, name: string, isOurTeam = false): GroupTeam {
  return { id, groupId: "g1", name, teamId: isOurTeam ? "t1" : null, isOurTeam, createdAt: STAMP, updatedAt: STAMP };
}

export const GROUP_TEAMS: GroupTeam[] = [
  team("gt-aquile", "Aquile Volley", true),
  team("gt-delfini", "Delfini Volley"),
  team("gt-falchi", "Falchi Volley"),
  team("gt-leoni", "Leoni Volley"),
  team("gt-tigri", "Tigri Volley"),
];

function row(position: number, groupTeam: GroupTeam, points: number, played: number, won: number): StandingRow {
  return {
    position,
    groupTeamId: groupTeam.id,
    name: groupTeam.name,
    teamId: groupTeam.teamId,
    isOurTeam: groupTeam.isOurTeam,
    points,
    played,
    won,
    lost: played - won,
    setsFor: won * 3,
    setsAgainst: (played - won) * 3,
    setRatio: null,
    pointsFor: 0,
    pointsAgainst: 0,
    pointRatio: null,
  };
}

const [aquile, delfini, falchi, leoni, tigri] = GROUP_TEAMS as [GroupTeam, GroupTeam, GroupTeam, GroupTeam, GroupTeam];

function standings(rows: StandingRow[], played: number): Standings {
  return {
    competitionId: "c1",
    groupId: "g1",
    groupName: "Girone B",
    pointsRules: COMPETITION.pointsRules,
    tiebreakers: COMPETITION.tiebreakers,
    matchesPlayed: played,
    matchesTotal: 10,
    rows,
  };
}

/** Before the 3-1 of the Aquile over the Delfini: the Aquile are third. */
export const STANDINGS_BEFORE = standings(
  [row(1, falchi, 31, 11, 10), row(2, delfini, 30, 11, 9), row(3, aquile, 29, 11, 9), row(4, leoni, 24, 11, 8), row(5, tigri, 19, 11, 6)],
  6,
);

/** After it: the Aquile climb to first place with 32 points, Falchi and Delfini each lose one place. */
export const STANDINGS_AFTER = standings(
  [row(1, aquile, 32, 12, 10), row(2, falchi, 31, 11, 10), row(3, delfini, 30, 12, 9), row(4, leoni, 24, 11, 8), row(5, tigri, 19, 11, 6)],
  7,
);

export function match(overrides: Partial<Match> & Pick<Match, "id">): Match {
  return {
    competitionId: "c1",
    groupId: "g1",
    round: 1,
    homeTeam: { id: aquile.id, name: aquile.name, isOurTeam: true },
    awayTeam: { id: delfini.id, name: delfini.name, isOurTeam: false },
    status: "SCHEDULED",
    homeSets: null,
    awaySets: null,
    setScores: null,
    playedAt: "2026-11-14T19:30:00.000Z",
    eventId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}
