import { z } from "zod";
import { MAX_SETS, validateMatchResult } from "./match-result";

/** Form values are strings (HTML inputs); `toResultBody` and friends convert them after validation. */

const INTEGER = /^\d+$/;

function parseInteger(value: string): number | null {
  return INTEGER.test(value.trim()) ? Number(value.trim()) : null;
}

export const resultFormSchema = z
  .object({
    homeSets: z.string(),
    awaySets: z.string(),
    detailed: z.boolean(),
    sets: z.array(z.object({ home: z.string(), away: z.string() })).length(MAX_SETS),
    playedAt: z.string(),
  })
  .superRefine((values, ctx) => {
    const homeSets = parseInteger(values.homeSets);
    const awaySets = parseInteger(values.awaySets);
    if (homeSets === null || homeSets > 3) ctx.addIssue({ code: "custom", path: ["homeSets"], message: "Inserisci un numero da 0 a 3" });
    if (awaySets === null || awaySets > 3) ctx.addIssue({ code: "custom", path: ["awaySets"], message: "Inserisci un numero da 0 a 3" });
    if (homeSets === null || awaySets === null || homeSets > 3 || awaySets > 3) return;

    const detail = values.detailed ? values.sets.slice(0, homeSets + awaySets) : undefined;
    const parsed = detail?.map((set) => [parseInteger(set.home), parseInteger(set.away)] as const);
    const setScores = parsed?.every(([home, away]) => home !== null && away !== null)
      ? parsed.map(([home, away]) => [home ?? 0, away ?? 0] as const)
      : undefined;
    if (detail && !setScores) {
      detail.forEach((set, index) => {
        if (parseInteger(set.home) === null) ctx.addIssue({ code: "custom", path: ["sets", index, "home"], message: `Set ${index + 1}: inserisci i punti` });
        else if (parseInteger(set.away) === null) ctx.addIssue({ code: "custom", path: ["sets", index, "away"], message: `Set ${index + 1}: inserisci i punti` });
      });
      return;
    }

    for (const problem of validateMatchResult({ homeSets, awaySets, setScores })) {
      const index = /^setScores\.(\d+)$/.exec(problem.path)?.[1];
      const path = index !== undefined ? ["sets", Number(index), "home"] : problem.path === "setScores" ? ["detailed"] : ["awaySets"];
      ctx.addIssue({ code: "custom", path, message: problem.message });
    }
  });

export type ResultFormValues = z.infer<typeof resultFormSchema>;

export const matchFormSchema = z
  .object({
    round: z.string().refine((value) => value === "" || (INTEGER.test(value) && Number(value) >= 1 && Number(value) <= 200), {
      message: "Inserisci una giornata da 1 a 200",
    }),
    homeTeamId: z.string().min(1, "Scegli la squadra di casa"),
    awayTeamId: z.string().min(1, "Scegli la squadra ospite"),
    playedAt: z.string(),
    status: z.enum(["SCHEDULED", "POSTPONED", "CANCELLED"]),
  })
  .refine((values) => values.homeTeamId === "" || values.homeTeamId !== values.awayTeamId, {
    message: "Una squadra non può giocare contro se stessa",
    path: ["awayTeamId"],
  });

export type MatchFormValues = z.infer<typeof matchFormSchema>;

export const seasonFormSchema = z
  .object({
    name: z.string().trim().min(1, "Scrivi il nome della stagione").max(40, "Massimo 40 caratteri"),
    startsOn: z.string().min(1, "Scegli la data di inizio"),
    endsOn: z.string().min(1, "Scegli la data di fine"),
    isCurrent: z.boolean(),
  })
  .refine((values) => !values.startsOn || !values.endsOn || values.endsOn > values.startsOn, {
    message: "La fine deve essere dopo l'inizio",
    path: ["endsOn"],
  });

export type SeasonFormValues = z.infer<typeof seasonFormSchema>;

export const nameFormSchema = z.object({
  name: z.string().trim().min(1, "Scrivi un nome").max(80, "Massimo 80 caratteri"),
});

export type NameFormValues = z.infer<typeof nameFormSchema>;

const tiebreakerField = z.enum(["", "WINS", "SET_RATIO", "POINT_RATIO"]);
const points = z.string().regex(/^\d$/, "Da 0 a 9");

export const competitionFormSchema = z
  .object({
    name: z.string().trim().min(1, "Scrivi il nome").max(120, "Massimo 120 caratteri"),
    kind: z.enum(["LEAGUE", "TOURNAMENT"]),
    win30: points,
    lose30: points,
    win31: points,
    lose31: points,
    win32: points,
    lose32: points,
    tiebreaker1: tiebreakerField,
    tiebreaker2: tiebreakerField,
    tiebreaker3: tiebreakerField,
  })
  .refine(
    (values) => {
      const chosen = [values.tiebreaker1, values.tiebreaker2, values.tiebreaker3].filter(Boolean);
      return new Set(chosen).size === chosen.length;
    },
    { message: "Ogni criterio può comparire una sola volta", path: ["tiebreaker1"] },
  );

export type CompetitionFormValues = z.infer<typeof competitionFormSchema>;

export const ownTeamFormSchema = z.object({ teamId: z.string().min(1, "Scegli la squadra") });
export type OwnTeamFormValues = z.infer<typeof ownTeamFormSchema>;
