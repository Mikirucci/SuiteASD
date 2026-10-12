import type { FieldError } from '../../lib/errors.js';

// Volleyball scoring rules (best of five): pure validation of a result before it is stored.

export const SETS_TO_WIN = 3;
const SET_TARGET = 25;
const DECIDING_SET_TARGET = 15;
const MIN_MARGIN = 2;

export interface MatchResultInput {
  homeSets: number;
  awaySets: number;
  setScores?: readonly (readonly [number, number])[] | undefined;
}

function isValidSet(winnerPoints: number, loserPoints: number, target: number): boolean {
  if (winnerPoints < target || winnerPoints - loserPoints < MIN_MARGIN) return false;
  // Above the target the set only continues while the margin is below 2, so the final margin is exactly 2.
  return winnerPoints === target || winnerPoints - loserPoints === MIN_MARGIN;
}

// Returns the list of problems (empty when the result is coherent). Paths follow the request body.
export function validateMatchResult(input: MatchResultInput): FieldError[] {
  const { homeSets, awaySets, setScores } = input;
  const higher = Math.max(homeSets, awaySets);
  const lower = Math.min(homeSets, awaySets);

  if (higher !== SETS_TO_WIN || lower >= SETS_TO_WIN) {
    return [{ path: 'homeSets', message: `The winner must win exactly ${SETS_TO_WIN} sets and the loser fewer` }];
  }
  if (!setScores) return [];

  const errors: FieldError[] = [];
  const totalSets = homeSets + awaySets;
  if (setScores.length !== totalSets) {
    return [{ path: 'setScores', message: `Expected ${totalSets} sets, received ${setScores.length}` }];
  }

  let homeWon = 0;
  let awayWon = 0;
  let decidedEarly = false;
  let invalidSets = 0;
  for (const [index, [homePoints, awayPoints]] of setScores.entries()) {
    const isDeciding = totalSets === 2 * SETS_TO_WIN - 1 && index === totalSets - 1;
    const target = isDeciding ? DECIDING_SET_TARGET : SET_TARGET;
    const homeWins = homePoints > awayPoints;
    const valid = homeWins ? isValidSet(homePoints, awayPoints, target) : isValidSet(awayPoints, homePoints, target);
    if (!valid) {
      errors.push({
        path: `setScores.${index}`,
        message: `Set ${index + 1} is not a valid score (play to ${target}, win by ${MIN_MARGIN})`,
      });
      // The running tally is meaningless once a set is broken: report that set only.
      invalidSets += 1;
      continue;
    }
    if (homeWins) homeWon += 1;
    else awayWon += 1;
    if (index < totalSets - 1 && (homeWon === SETS_TO_WIN || awayWon === SETS_TO_WIN)) decidedEarly = true;
  }

  if (invalidSets === 0 && (homeWon !== homeSets || awayWon !== awaySets || decidedEarly)) {
    errors.push({ path: 'setScores', message: 'The set scores do not match the final result' });
  }
  return errors;
}
