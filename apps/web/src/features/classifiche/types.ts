/** Wire types of the competitions module. Source of truth: apps/api/src/modules/competitions/schema.ts. */

export type CompetitionKind = "LEAGUE" | "TOURNAMENT";
export type MatchStatus = "SCHEDULED" | "PLAYED" | "POSTPONED" | "CANCELLED";
export type Tiebreaker = "WINS" | "SET_RATIO" | "POINT_RATIO";

export interface Season {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Points [winner, loser] by final set score. */
export type PointsRulePair = [number, number];

export interface PointsRules {
  "3-0": PointsRulePair;
  "3-1": PointsRulePair;
  "3-2": PointsRulePair;
}

export interface Competition {
  id: string;
  seasonId: string;
  name: string;
  kind: CompetitionKind;
  sport: "VOLLEY";
  pointsRules: PointsRules;
  tiebreakers: Tiebreaker[];
  groupsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  competitionId: string;
  name: string;
  teamsCount: number;
  matchesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupTeam {
  id: string;
  groupId: string;
  name: string;
  teamId: string | null;
  isOurTeam: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchSide {
  id: string;
  name: string;
  isOurTeam: boolean;
}

/** One [home, away] pair per set. */
export type SetScores = Array<[number, number]>;

export interface Match {
  id: string;
  competitionId: string;
  groupId: string;
  round: number | null;
  homeTeam: MatchSide;
  awayTeam: MatchSide;
  status: MatchStatus;
  homeSets: number | null;
  awaySets: number | null;
  setScores: SetScores | null;
  playedAt: string | null;
  eventId: string | null;
  createdAt: string;
  updatedAt: string;
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
  setRatio: number | null;
  pointsFor: number;
  pointsAgainst: number;
  pointRatio: number | null;
}

export interface Standings {
  competitionId: string;
  groupId: string;
  groupName: string;
  pointsRules: PointsRules;
  tiebreakers: Tiebreaker[];
  matchesPlayed: number;
  matchesTotal: number;
  rows: StandingRow[];
}

/** Our own team (apps/api teams module), used to add it to a group. */
export interface OwnTeam {
  id: string;
  name: string;
  category: string | null;
}

/** Body of PUT /matches/:id/result. */
export interface MatchResultBody {
  homeSets: number;
  awaySets: number;
  setScores?: SetScores;
  playedAt?: string;
}
