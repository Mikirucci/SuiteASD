/** Wire types of the evaluations module. Source of truth: apps/api/src/modules/evaluations/schema.ts. */

export interface Evaluation {
  id: string;
  matchId: string;
  memberId: string;
  /** 1 to 10, at most one decimal. */
  rating: number;
  notes: string | null;
  /** True for the best rating of the match (ties share it). */
  isMvp: boolean;
  published: boolean;
  publishedAt: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StatLine {
  attackPoints: number;
  aces: number;
  blocks: number;
  receptions: number;
  errors: number;
}

export interface MatchStats extends StatLine {
  matchId: string;
  memberId: string;
  updatedAt: string;
}

export interface MemberBrief {
  id: string;
  firstName: string;
  lastName: string;
  /** Role on the court, e.g. "Schiacciatrice". */
  fieldRole: string | null;
}

export interface ReportCardEntry {
  member: MemberBrief;
  evaluation: Evaluation | null;
  stats: MatchStats | null;
}

export interface ReportCards {
  matchId: string;
  /** e.g. "Aquile Volley 3-1 Delfini Volley". */
  label: string;
  data: ReportCardEntry[];
}

export interface PublishResult {
  publishedCount: number;
  evaluations: Evaluation[];
}

export interface TrendPoint {
  matchId: string;
  playedAt: string | null;
  rating: number;
}

export interface EvaluationSummary {
  matchesRated: number;
  averageRating: number | null;
  bestRating: number | null;
  mvpCount: number;
  totals: StatLine;
  /** Chronological. */
  trend: TrendPoint[];
}

export interface MemberSummary extends EvaluationSummary {
  member: MemberBrief;
}

export interface HistoryItem {
  matchId: string;
  round: number | null;
  playedAt: string | null;
  label: string;
  evaluation: Evaluation;
  stats: MatchStats | null;
}

/** Body of PUT /matches/:id/evaluations/:memberId. */
export interface EvaluationBody {
  rating: number;
  notes: string | null;
}
