import { describe, expect, it } from 'vitest';
import {
  formatRating,
  isValidRating,
  pickMvpMemberIds,
  summarizeEvaluations,
  type SummaryEntry,
} from '../../src/modules/evaluations/rules.js';

describe('pickMvpMemberIds (MVP = highest rating of the match)', () => {
  it('picks the single best rating', () => {
    const mvp = pickMvpMemberIds([
      { memberId: 'giulia', rating: 8.5 },
      { memberId: 'elena', rating: 7 },
      { memberId: 'sara', rating: 8.4 },
    ]);
    expect([...mvp]).toEqual(['giulia']);
  });

  it('shares the MVP among players tied on the best rating', () => {
    const mvp = pickMvpMemberIds([
      { memberId: 'a', rating: 9 },
      { memberId: 'b', rating: 9 },
      { memberId: 'c', rating: 6 },
    ]);
    expect([...mvp].sort()).toEqual(['a', 'b']);
  });

  it('awards the MVP to the only rated player and to nobody when there are no ratings', () => {
    expect([...pickMvpMemberIds([{ memberId: 'a', rating: 5 }])]).toEqual(['a']);
    expect(pickMvpMemberIds([]).size).toBe(0);
  });

  it('does not depend on the input order', () => {
    const entries = [
      { memberId: 'a', rating: 7.5 },
      { memberId: 'b', rating: 8 },
      { memberId: 'c', rating: 8 },
    ];
    expect([...pickMvpMemberIds([...entries].reverse())].sort()).toEqual([...pickMvpMemberIds(entries)].sort());
  });
});

describe('rating helpers', () => {
  it.each([1, 5.5, 8.5, 10, 7.3])('accepts %s', (rating) => {
    expect(isValidRating(rating)).toBe(true);
  });

  it.each([0.9, 10.1, 0, 11, 8.55, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (rating) => {
    expect(isValidRating(rating)).toBe(false);
  });

  it('formats with the Italian decimal comma', () => {
    expect(formatRating(8.5)).toBe('8,5');
    expect(formatRating(9)).toBe('9');
    expect(formatRating(7.25)).toBe('7,3');
  });
});

describe('summarizeEvaluations', () => {
  const entry = (matchId: string, playedAt: string, rating: number, isMvp: boolean, stats: SummaryEntry['stats']): SummaryEntry => ({
    matchId,
    playedAt: new Date(playedAt),
    rating,
    isMvp,
    stats,
  });

  it('returns zeros and a null average for a player without published report cards', () => {
    expect(summarizeEvaluations([])).toEqual({
      matchesRated: 0,
      averageRating: null,
      bestRating: null,
      mvpCount: 0,
      totals: { attackPoints: 0, aces: 0, blocks: 0, receptions: 0, errors: 0 },
      trend: [],
    });
  });

  it('computes average, best rating, MVP count, totals and a chronological trend', () => {
    const summary = summarizeEvaluations([
      entry('m2', '2026-11-14T19:30:00Z', 8.5, true, { attackPoints: 14, aces: 2, blocks: 3, receptions: 10, errors: 4 }),
      entry('m1', '2026-11-07T19:30:00Z', 7, false, { attackPoints: 9, aces: 1, blocks: 0, receptions: 12, errors: 2 }),
      entry('m3', '2026-11-21T19:30:00Z', 6.5, false, null),
    ]);
    expect(summary).toMatchObject({
      matchesRated: 3,
      averageRating: 7.33,
      bestRating: 8.5,
      mvpCount: 1,
      totals: { attackPoints: 23, aces: 3, blocks: 3, receptions: 22, errors: 6 },
    });
    expect(summary.trend.map((point) => [point.matchId, point.rating])).toEqual([
      ['m1', 7],
      ['m2', 8.5],
      ['m3', 6.5],
    ]);
  });
});
