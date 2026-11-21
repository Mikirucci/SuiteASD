import { z } from "zod";
import { toDayKey } from "@/lib/dates";
import { parseEuroToCents } from "@/lib/format";
import type { CreateFeePlanBody, PayFeeBody } from "./types";

/** Limits mirror apps/api/src/modules/fees/schema.ts so most mistakes are caught before the request. */
const dayText = z.iso.date("Inserisci una data valida");

// ---------------------------------------------------------------------------
// Payment registration
// ---------------------------------------------------------------------------

export function createPaySchema(today: string = toDayKey(new Date())) {
  return z.object({
    method: z.enum(["CASH", "BANK_TRANSFER", "CARD"]),
    paidDate: dayText.refine((day) => day <= today, "La data del pagamento non può essere futura"),
    payerName: z.string().trim().max(120, "Massimo 120 caratteri"),
    payerEmail: z
      .string()
      .trim()
      .max(254, "L'email è troppo lunga")
      .refine((value) => value === "" || z.email().safeParse(value).success, "Inserisci un'email valida"),
    reference: z.string().trim().max(120, "Massimo 120 caratteri"),
  });
}

export type PayValues = z.infer<ReturnType<typeof createPaySchema>>;

/** Request body of POST /fees/:id/pay. A payment dated today is sent without `paidAt`: the server stamps the real time. */
export function toPayBody(values: PayValues, today: string = toDayKey(new Date())): PayFeeBody {
  const body: PayFeeBody = { method: values.method };
  if (values.paidDate !== today) {
    const [year = 0, month = 1, day = 1] = values.paidDate.split("-").map(Number);
    body.paidAt = new Date(year, month - 1, day, 12).toISOString();
  }
  if (values.payerName) body.payerName = values.payerName;
  if (values.payerEmail) body.payerEmail = values.payerEmail;
  if (values.reference) body.reference = values.reference;
  return body;
}

// ---------------------------------------------------------------------------
// Fee plans
// ---------------------------------------------------------------------------

export const MAX_INSTALLMENTS = 36;

const planNameSchema = z.string().trim().min(1, "Inserisci il nome del piano").max(120, "Massimo 120 caratteri");
const feeKindSchema = z.enum(["ENROLLMENT", "MONTHLY", "EXTRA"]);

export const createPlanSchema = z
  .object({
    name: planNameSchema,
    kind: feeKindSchema,
    amount: z
      .string()
      .refine((value) => parseEuroToCents(value) !== null, "Inserisci un importo valido, per esempio 60 o 60,50"),
    allTeams: z.boolean(),
    teamIds: z.array(z.string()),
    installments: z
      .string()
      .trim()
      .refine(
        (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_INSTALLMENTS,
        `Inserisci un numero da 1 a ${MAX_INSTALLMENTS}`,
      ),
    dueDates: z.array(dayText),
  })
  .superRefine((values, context) => {
    if (!values.allTeams && values.teamIds.length === 0) {
      context.addIssue({ code: "custom", path: ["teamIds"], message: "Scegli almeno una squadra, oppure tutte" });
    }
    const seen = new Set<string>();
    values.dueDates.forEach((day, index) => {
      if (seen.has(day)) {
        context.addIssue({ code: "custom", path: ["dueDates", index], message: "Ogni scadenza deve essere diversa dalle altre" });
      }
      seen.add(day);
    });
  });

export type CreatePlanValues = z.infer<typeof createPlanSchema>;

export const editPlanSchema = z.object({ name: planNameSchema, kind: feeKindSchema, isActive: z.boolean() });

export type EditPlanValues = z.infer<typeof editPlanSchema>;

export function toCreatePlanBody(values: CreatePlanValues): CreateFeePlanBody {
  const cents = parseEuroToCents(values.amount);
  if (cents === null) throw new Error("Invalid amount: validate with createPlanSchema first");
  return {
    name: values.name,
    kind: values.kind,
    amountCents: cents,
    teamIds: values.allTeams ? [] : values.teamIds,
    dueDates: values.dueDates,
  };
}
