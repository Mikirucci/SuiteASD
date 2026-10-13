import type { Competition, Group, Standings, StandingRow } from "@/features/classifiche/types";

export { SEASON } from "@/features/classifiche/test-fixtures";

const STAMP = "2026-09-01T08:00:00.000Z";

export const TOURNAMENT: Competition = {
  id: "c-natale",
  seasonId: "s1",
  name: "Torneo di Natale",
  kind: "TOURNAMENT",
  sport: "VOLLEY",
  pointsRules: { "3-0": [3, 0], "3-1": [3, 0], "3-2": [2, 1] },
  tiebreakers: ["WINS", "SET_RATIO", "POINT_RATIO"],
  groupsCount: 2,
  createdAt: STAMP,
  updatedAt: STAMP,
};

function pool(id: string, name: string): Group {
  return { id, competitionId: TOURNAMENT.id, name, teamsCount: 3, matchesCount: 3, createdAt: STAMP, updatedAt: STAMP };
}

export const POOL_A = pool("g-a", "Girone A");
export const POOL_B = pool("g-b", "Girone B");

function row(position: number, name: string, points: number, won: number, isOurTeam = false): StandingRow {
  return {
    position,
    groupTeamId: `gt-${name}`,
    name,
    teamId: isOurTeam ? "t1" : null,
    isOurTeam,
    points,
    played: 2,
    won,
    lost: 2 - won,
    setsFor: won * 3,
    setsAgainst: (2 - won) * 3,
    setRatio: null,
    pointsFor: 0,
    pointsAgainst: 0,
    pointRatio: null,
  };
}

function standings(group: Group, rows: StandingRow[]): Standings {
  return {
    competitionId: TOURNAMENT.id,
    groupId: group.id,
    groupName: group.name,
    pointsRules: TOURNAMENT.pointsRules,
    tiebreakers: TOURNAMENT.tiebreakers,
    matchesPlayed: 3,
    matchesTotal: 3,
    rows,
  };
}

export const STANDINGS_A = standings(POOL_A, [
  row(1, "Aquile Volley", 6, 2, true),
  row(2, "Falchi Volley", 3, 1),
  row(3, "Delfini Volley", 0, 0),
]);

export const STANDINGS_B = standings(POOL_B, [
  row(1, "Tigri Volley", 6, 2),
  row(2, "Leoni Volley", 3, 1),
  row(3, "Orsi Volley", 0, 0),
]);
