import type {
  Evaluation,
  HistoryItem,
  MatchStats,
  MemberBrief,
  MemberSummary,
  ReportCardEntry,
  ReportCards,
} from "./types";

const STAMP = "2026-11-15T09:00:00.000Z";

export const GIULIA: MemberBrief = {
  id: "mb-giulia",
  firstName: "Giulia",
  lastName: "Rossi",
  fieldRole: "Schiacciatrice",
};
export const SARA: MemberBrief = { id: "mb-sara", firstName: "Sara", lastName: "Conti", fieldRole: "Libero" };
export const MARTA: MemberBrief = {
  id: "mb-marta",
  firstName: "Marta",
  lastName: "Bianchi",
  fieldRole: "Palleggiatrice",
};
export const ANNA: MemberBrief = { id: "mb-anna", firstName: "Anna", lastName: "Ferri", fieldRole: null };

export function evaluation(member: MemberBrief, overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: `ev-${member.id}`,
    matchId: "m1",
    memberId: member.id,
    rating: 7,
    notes: null,
    isMvp: false,
    published: true,
    publishedAt: STAMP,
    authorId: "u-coach",
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function stats(member: MemberBrief, line: Partial<MatchStats> = {}): MatchStats {
  return {
    matchId: "m1",
    memberId: member.id,
    attackPoints: 0,
    aces: 0,
    blocks: 0,
    receptions: 0,
    errors: 0,
    updatedAt: STAMP,
    ...line,
  };
}

/** Giulia (MVP, 8,5, with notes and statistics), Sara (7), Anna (draft 6,5), Marta (not rated yet). */
export const SQUAD: ReportCardEntry[] = [
  { member: ANNA, evaluation: evaluation(ANNA, { rating: 6.5, published: false, publishedAt: null }), stats: null },
  {
    member: MARTA,
    evaluation: null,
    stats: null,
  },
  {
    member: GIULIA,
    evaluation: evaluation(GIULIA, { rating: 8.5, isMvp: true, notes: "Ottimo ritmo in attacco nel terzo set." }),
    stats: stats(GIULIA, { attackPoints: 18, aces: 3, blocks: 2, receptions: 9, errors: 4 }),
  },
  { member: SARA, evaluation: evaluation(SARA, { rating: 7 }), stats: stats(SARA, { receptions: 15, errors: 1 }) },
];

export function reportCards(data: ReportCardEntry[]): ReportCards {
  return { matchId: "m1", label: "Aquile Volley 3–1 Delfini Volley", data };
}

export const SUMMARY_GIULIA: MemberSummary = {
  member: GIULIA,
  matchesRated: 3,
  averageRating: 8.2,
  bestRating: 9,
  mvpCount: 2,
  totals: { attackPoints: 41, aces: 7, blocks: 5, receptions: 22, errors: 9 },
  trend: [
    { matchId: "m-a", playedAt: "2026-10-17T12:00:00.000Z", rating: 7.5 },
    { matchId: "m-b", playedAt: "2026-10-31T12:00:00.000Z", rating: 9 },
    { matchId: "m1", playedAt: "2026-11-14T12:00:00.000Z", rating: 8.5 },
  ],
};

export const HISTORY_GIULIA: HistoryItem[] = [
  {
    matchId: "m1",
    round: 5,
    playedAt: "2026-11-14T12:00:00.000Z",
    label: "Aquile Volley 3–1 Delfini Volley",
    evaluation: evaluation(GIULIA, { rating: 8.5, isMvp: true, notes: "Ottimo ritmo in attacco." }),
    stats: null,
  },
  {
    matchId: "m-b",
    round: 4,
    playedAt: "2026-10-31T12:00:00.000Z",
    label: "Leoni Volley 0–3 Aquile Volley",
    evaluation: evaluation(GIULIA, { id: "ev-b", matchId: "m-b", rating: 9, isMvp: true }),
    stats: null,
  },
  {
    matchId: "m-a",
    round: 3,
    playedAt: "2026-10-17T12:00:00.000Z",
    label: "Aquile Volley 3–2 Tigri Volley",
    evaluation: evaluation(GIULIA, { id: "ev-a", matchId: "m-a", rating: 7.5, published: false, publishedAt: null }),
    stats: null,
  },
];
