import { z } from "zod";
import { parseEuroToCents } from "@/lib/format";
import type { CreateAssignmentBody, RefereeBody, UpdateAssignmentBody } from "./types";

/** Limits mirror apps/api/src/modules/referees/schema.ts so most mistakes are caught before the request. */

const FEE_MESSAGE = "Inserisci un importo valido, per esempio 25 o 25,50";

/** Empty means "no fee"; otherwise a euro amount the API accepts. */
const feeText = z.string().trim().refine((value) => value === "" || parseEuroToCents(value) !== null, FEE_MESSAGE);

export const refereeFormSchema = z.object({
  firstName: z.string().trim().min(1, "Scrivi il nome").max(80, "Massimo 80 caratteri"),
  lastName: z.string().trim().min(1, "Scrivi il cognome").max(80, "Massimo 80 caratteri"),
  email: z
    .string()
    .trim()
    .max(254, "L'email è troppo lunga")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Inserisci un'email valida"),
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || (value.length >= 3 && value.length <= 40), "Inserisci un numero da 3 a 40 caratteri"),
  qualification: z.string().trim().max(200, "Massimo 200 caratteri"),
  notes: z.string().trim().max(1000, "Massimo 1000 caratteri"),
});

export type RefereeFormValues = z.infer<typeof refereeFormSchema>;

/** POST omits the empty optional fields; PATCH sends them as `null` so a cleared field is really cleared. */
export function toRefereeBody(values: RefereeFormValues, mode: "create" | "update"): RefereeBody {
  const optional = (value: string): string | null | undefined => (value !== "" ? value : mode === "update" ? null : undefined);
  const body: RefereeBody = { firstName: values.firstName, lastName: values.lastName };
  const fields = {
    email: optional(values.email),
    phone: optional(values.phone),
    qualification: optional(values.qualification),
    notes: optional(values.notes),
  };
  for (const [key, value] of Object.entries(fields) as Array<[keyof typeof fields, string | null | undefined]>) {
    if (value !== undefined) body[key] = value;
  }
  return body;
}

export const assignmentFormSchema = z.object({
  refereeId: z.string().min(1, "Scegli l'arbitro"),
  matchId: z.string().min(1, "Scegli la partita"),
  fee: feeText,
});

export type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;

export function toCreateAssignmentBody(values: AssignmentFormValues): CreateAssignmentBody {
  const cents = parseEuroToCents(values.fee);
  const body: CreateAssignmentBody = { refereeId: values.refereeId, matchId: values.matchId };
  if (cents !== null) body.feeCents = cents;
  return body;
}

export const feeFormSchema = z.object({ fee: feeText });

export type FeeFormValues = z.infer<typeof feeFormSchema>;

/** An emptied field removes the fee (and with it the refund). */
export function toFeeBody(values: FeeFormValues): UpdateAssignmentBody {
  return { feeCents: parseEuroToCents(values.fee) };
}
