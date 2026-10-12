/** Volleyball rules (best of five). Mirrors apps/api/src/modules/competitions/match-result.ts; the server stays the authority. */

export const SETS_TO_WIN = 3;
export const MAX_SETS = 2 * SETS_TO_WIN - 1;
const SET_TARGET = 25;
const DECIDING_SET_TARGET = 15;
const MIN_MARGIN = 2;

export interface MatchResultInput {
  homeSets: number;
  awaySets: number;
  setScores?: ReadonlyArray<readonly [number, number]>;
}

export interface ResultProblem {
  /** "homeSets", "setScores" or "setScores.<index>" (same paths as the API). */
  path: string;
  message: string;
}

function isValidSet(winnerPoints: number, loserPoints: number, target: number): boolean {
  if (winnerPoints < target || winnerPoints - loserPoints < MIN_MARGIN) return false;
  // Past the target a set goes on until the margin is exactly two points
  return winnerPoints === target || winnerPoints - loserPoints === MIN_MARGIN;
}

/** Target of a set: the fifth one is played to 15, the others to 25. */
export function setTarget(index: number, totalSets: number): number {
  return totalSets === MAX_SETS && index === totalSets - 1 ? DECIDING_SET_TARGET : SET_TARGET;
}

export function validateMatchResult({ homeSets, awaySets, setScores }: MatchResultInput): ResultProblem[] {
  const higher = Math.max(homeSets, awaySets);
  const lower = Math.min(homeSets, awaySets);
  if (higher !== SETS_TO_WIN || lower >= SETS_TO_WIN) {
    return [{ path: "homeSets", message: `Una squadra deve vincere ${SETS_TO_WIN} set e l'altra meno di ${SETS_TO_WIN}` }];
  }
  if (!setScores) return [];

  const totalSets = homeSets + awaySets;
  if (setScores.length !== totalSets) {
    return [{ path: "setScores", message: `Servono i punteggi di ${totalSets} set` }];
  }

  const problems: ResultProblem[] = [];
  let homeWon = 0;
  let awayWon = 0;
  let decidedEarly = false;
  let invalidSets = 0;
  for (const [index, [homePoints, awayPoints]] of setScores.entries()) {
    const target = setTarget(index, totalSets);
    const homeWins = homePoints > awayPoints;
    const valid = homeWins ? isValidSet(homePoints, awayPoints, target) : isValidSet(awayPoints, homePoints, target);
    if (!valid) {
      problems.push({
        path: `setScores.${index}`,
        message: `Set ${index + 1} non valido: si gioca a ${target} con almeno ${MIN_MARGIN} punti di scarto`,
      });
      invalidSets += 1;
      continue;
    }
    if (homeWins) homeWon += 1;
    else awayWon += 1;
    if (index < totalSets - 1 && (homeWon === SETS_TO_WIN || awayWon === SETS_TO_WIN)) decidedEarly = true;
  }

  if (invalidSets === 0 && (homeWon !== homeSets || awayWon !== awaySets || decidedEarly)) {
    problems.push({ path: "setScores", message: "I punteggi dei set non corrispondono al risultato finale" });
  }
  return problems;
}
