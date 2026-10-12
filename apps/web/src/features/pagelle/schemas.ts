import { z } from "zod";
import { parseRating } from "./rating";

const count = z
  .string()
  .refine((value) => value.trim() === "" || (/^\d+$/.test(value.trim()) && Number(value) <= 500), {
    message: "Da 0 a 500",
  });

export const evaluationFormSchema = z.object({
  rating: z.string().refine((value) => parseRating(value) !== null, {
    message: "Inserisci un voto da 1 a 10, con al massimo un decimale (per esempio 8,5)",
  }),
  notes: z.string().max(1000, "Massimo 1000 caratteri"),
  attackPoints: count,
  aces: count,
  blocks: count,
  receptions: count,
  errors: count,
});

export type EvaluationFormValues = z.infer<typeof evaluationFormSchema>;
