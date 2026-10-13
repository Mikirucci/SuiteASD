import type { StatisticsOverview } from "./types";

export const OVERVIEW: StatisticsOverview = {
  members: {
    total: 118,
    byTeam: [
      { teamId: "t-u14", teamName: "U14", count: 21 },
      { teamId: "t-u16", teamName: "U16", count: 28 },
      { teamId: "t-u18", teamName: "U18", count: 24 },
      { teamId: "t-serie-d", teamName: "Serie D", count: 16 },
    ],
  },
  certificates: { OK: 96, EXPIRING: 9, EXPIRED: 5, MISSING: 8 },
  fees: { collectedCents: 640000, toCollectCents: 182050, overdueCents: 54000, remindersSent: 37 },
  attendance: { averagePercent: 84, recordsCount: 412 },
  upcomingEvents: [
    { id: "e1", type: "MATCH", title: "Aquile Volley - Delfini Volley", startsAt: "2026-11-14T19:30:00.000Z", teamName: "Serie D" },
    { id: "e2", type: "TRAINING", title: "Allenamento U16", startsAt: "2026-11-12T17:00:00.000Z", teamName: "U16" },
  ],
  latestResults: [
    {
      matchId: "m1",
      competitionName: "Serie D femminile",
      homeTeam: "Aquile Volley",
      awayTeam: "Falchi Volley",
      homeSets: 3,
      awaySets: 1,
      playedAt: "2026-11-07T19:30:00.000Z",
    },
  ],
};

export const EMPTY_OVERVIEW: StatisticsOverview = {
  members: { total: 0, byTeam: [] },
  certificates: { OK: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 },
  fees: { collectedCents: 0, toCollectCents: 0, overdueCents: 0, remindersSent: 0 },
  attendance: { averagePercent: null, recordsCount: 0 },
  upcomingEvents: [],
  latestResults: [],
};
