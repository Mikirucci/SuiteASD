/** Wire types of GET /statistics/overview. Source of truth: apps/api/src/modules/statistics/schema.ts. */

export type EventType = "MATCH" | "TRAINING" | "TOURNAMENT" | "MEETING";
export type CertificateStatus = "OK" | "EXPIRING" | "EXPIRED" | "MISSING";

export interface TeamCount {
  teamId: string;
  teamName: string;
  count: number;
}

export interface UpcomingEvent {
  id: string;
  type: EventType;
  title: string;
  startsAt: string;
  teamName: string | null;
}

export interface LatestResult {
  matchId: string;
  competitionName: string;
  homeTeam: string;
  awayTeam: string;
  homeSets: number;
  awaySets: number;
  playedAt: string | null;
}

export interface StatisticsOverview {
  members: { total: number; byTeam: TeamCount[] };
  certificates: Record<CertificateStatus, number>;
  fees: { collectedCents: number; toCollectCents: number; overdueCents: number; remindersSent: number };
  attendance: { averagePercent: number | null; recordsCount: number };
  upcomingEvents: UpcomingEvent[];
  latestResults: LatestResult[];
}
