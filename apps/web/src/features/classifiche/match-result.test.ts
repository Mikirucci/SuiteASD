import { describe, expect, it } from "vitest";
import { validateMatchResult } from "./match-result";

describe("validateMatchResult", () => {
  it.each([
    [3, 0],
    [3, 1],
    [3, 2],
    [0, 3],
    [2, 3],
  ])("accepts %i-%i", (homeSets, awaySets) => {
    expect(validateMatchResult({ homeSets, awaySets })).toEqual([]);
  });

  it.each([
    [3, 3],
    [2, 1],
    [0, 0],
    [4, 0],
  ])("rejects %i-%i: someone must win exactly three sets", (homeSets, awaySets) => {
    expect(validateMatchResult({ homeSets, awaySets }).map((problem) => problem.path)).toEqual(["homeSets"]);
  });

  it("accepts coherent set scores, including a deciding set to 15 and extra points", () => {
    expect(
      validateMatchResult({
        homeSets: 3,
        awaySets: 2,
        setScores: [
          [25, 20],
          [22, 25],
          [27, 25],
          [20, 25],
          [15, 13],
        ],
      }),
    ).toEqual([]);
  });

  it("requires one score per set", () => {
    const problems = validateMatchResult({ homeSets: 3, awaySets: 1, setScores: [[25, 20]] });
    expect(problems).toEqual([{ path: "setScores", message: "Servono i punteggi di 4 set" }]);
  });

  it("flags a set that is not won by two points or does not reach the target", () => {
    const problems = validateMatchResult({
      homeSets: 3,
      awaySets: 0,
      setScores: [
        [25, 24],
        [20, 18],
        [25, 10],
      ],
    });
    expect(problems.map((problem) => problem.path)).toEqual(["setScores.0", "setScores.1"]);
  });

  it("flags a deciding set that stops short of 15 points", () => {
    expect(
      validateMatchResult({
        homeSets: 3,
        awaySets: 2,
        setScores: [
          [25, 20],
          [22, 25],
          [27, 25],
          [20, 25],
          [14, 12],
        ],
      }).map((problem) => problem.path),
    ).toEqual(["setScores.4"]);
  });

  it("flags set scores that contradict the final result", () => {
    const problems = validateMatchResult({
      homeSets: 3,
      awaySets: 1,
      setScores: [
        [25, 20],
        [25, 20],
        [25, 20],
        [20, 25],
      ],
    });
    expect(problems).toEqual([{ path: "setScores", message: "I punteggi dei set non corrispondono al risultato finale" }]);
  });
});
