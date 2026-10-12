// Pure business rules of the report cards (SPEC 06): rating scale, MVP, season aggregates. No I/O.

export const MIN_RATING = 1;
export const MAX_RATING = 10;

// Scale 1-10 with at most one decimal (e.g. 8.5).
export function isValidRating(rating: number): boolean {
  return Number.isFinite(rating) && rating >= MIN_RATING && rating <= MAX_RATING && Math.round(rating * 10) / 10 === rating;
}

// Italian display (decimal comma), used in notification texts: 8.5 -> "8,5", 9 -> "9".
export function formatRating(rating: number): string {
  return (Math.round(rating * 10) / 10).toString().replace('.', ',');
}

// MVP rule (explicit and tested): the player(s) with the highest rating of the match; players tied on that
// rating share the badge. Nobody is MVP when the match has no ratings.
export function pickMvpMemberIds(entries: readonly { memberId: string; rating: number }[]): Set<string> {
  const best = Math.max(...entries.map((entry) => entry.rating));
  return new Set(entries.filter((entry) => entry.rating === best).map((entry) => entry.memberId));
}

export interface StatLine {
  attackPoints: number;
  aces: number;
  blocks: number;
  receptions: number;
  errors: number;
}

export interface SummaryEntry {
  matchId: string;
  playedAt: Date | null;
  rating: number;
  isMvp: boolean;
  stats: StatLine | null;
}

export interface TrendPoint {
  matchId: string;
  playedAt: Date | null;
  rating: number;
}

export interface EvaluationSummary {
  matchesRated: number;
  averageRating: number | null;
  bestRating: number | null;
  mvpCount: number;
  totals: StatLine;
  trend: TrendPoint[];
}

export function emptyStatLine(): StatLine {
  return { attackPoints: 0, aces: 0, blocks: 0, receptions: 0, errors: 0 };
}

// Season aggregates of one player over the given (published) evaluations, oldest match first.
export function summarizeEvaluations(entries: readonly SummaryEntry[]): EvaluationSummary {
  const totals = emptyStatLine();
  for (const { stats } of entries) {
    if (!stats) continue;
    totals.attackPoints += stats.attackPoints;
    totals.aces += stats.aces;
    totals.blocks += stats.blocks;
    totals.receptions += stats.receptions;
    totals.errors += stats.errors;
  }
  const ratings = entries.map((entry) => entry.rating);
  const trend = [...entries]
    .sort((a, b) => (a.playedAt?.getTime() ?? 0) - (b.playedAt?.getTime() ?? 0) || a.matchId.localeCompare(b.matchId))
    .map(({ matchId, playedAt, rating }) => ({ matchId, playedAt, rating }));
  return {
    matchesRated: entries.length,
    averageRating: entries.length === 0 ? null : Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / entries.length) * 100) / 100,
    bestRating: entries.length === 0 ? null : Math.max(...ratings),
    mvpCount: entries.filter((entry) => entry.isMvp).length,
    totals,
    trend,
  };
}
