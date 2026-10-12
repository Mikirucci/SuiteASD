import { describe, expect, it } from 'vitest';
import { validateMatchResult } from '../../src/modules/competitions/match-result.js';

type SetScore = [number, number];
const result = (homeSets: number, awaySets: number, setScores?: SetScore[]) => ({ homeSets, awaySets, setScores });
const paths = (input: ReturnType<typeof result>) => validateMatchResult(input).map((issue) => issue.path);

describe('validateMatchResult: set totals', () => {
  it.each([
    [3, 0],
    [3, 1],
    [3, 2],
    [0, 3],
    [1, 3],
    [2, 3],
  ])('accepts %i-%i', (home, away) => {
    expect(validateMatchResult(result(home, away))).toEqual([]);
  });

  it.each([
    [2, 2, 'a draw cannot exist'],
    [3, 3, 'both sides cannot win'],
    [2, 1, 'nobody reached 3 sets'],
    [4, 0, 'more than 3 sets won'],
    [0, 0, 'nothing played'],
  ])('rejects %i-%i (%s)', (home, away) => {
    expect(validateMatchResult(result(home, away))).not.toEqual([]);
  });
});

describe('validateMatchResult: set by set', () => {
  it('accepts a coherent 3-1 with set scores', () => {
    expect(validateMatchResult(result(3, 1, [[25, 20], [22, 25], [25, 18], [25, 23]]))).toEqual([]);
  });

  it('accepts a 3-2 with a fifth set to 15 and extended sets with a 2 point margin', () => {
    expect(validateMatchResult(result(3, 2, [[27, 25], [20, 25], [25, 22], [24, 26], [15, 13]]))).toEqual([]);
    expect(validateMatchResult(result(3, 2, [[25, 20], [20, 25], [25, 22], [24, 26], [16, 14]]))).toEqual([]);
  });

  it('rejects a number of sets that does not match the totals', () => {
    expect(paths(result(3, 1, [[25, 20], [25, 20], [25, 20]]))).toContain('setScores');
  });

  it('rejects set winners that disagree with the totals', () => {
    expect(paths(result(3, 1, [[25, 20], [25, 20], [25, 20], [25, 20]]))).toContain('setScores');
  });

  it('rejects a set that was not won by 2 points or did not reach 25', () => {
    expect(paths(result(3, 0, [[25, 24], [25, 20], [25, 20]]))).toEqual(['setScores.0']);
    expect(paths(result(3, 0, [[24, 20], [25, 20], [25, 20]]))).toEqual(['setScores.0']);
  });

  it('rejects an extended set whose margin is not exactly 2', () => {
    expect(paths(result(3, 0, [[28, 25], [25, 20], [25, 20]]))).toEqual(['setScores.0']);
  });

  it('requires the fifth set to be played to 15, not 25', () => {
    expect(paths(result(3, 2, [[25, 20], [20, 25], [25, 22], [24, 26], [25, 20]]))).toEqual(['setScores.4']);
  });

  it('rejects scores where a side reaches 3 sets before the last set', () => {
    // sets won in order: home, home, home, away -> match ended after the third set
    expect(paths(result(3, 1, [[25, 20], [25, 20], [25, 20], [20, 25]]))).toContain('setScores');
  });

  it('rejects tied or negative set scores', () => {
    expect(paths(result(3, 0, [[25, 25], [25, 20], [25, 20]]))).toEqual(['setScores.0']);
  });
});
