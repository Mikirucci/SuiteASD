import { z } from "zod";
import { toDayKey } from "@/lib/dates";
import { parseEuroToCents } from "./format";
import type { FeePlanBody, GenerateFeesBody, PayFeeBody } from "./types";

/** Limits mirror apps/api/src/modules/fees/schema.ts so most mistakes are caught before the request. */
const dayText = z.iso.date("Inserisci una data valida");

function optionalInteger(min: number, max: number, message: string) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= min && Number(value) <= max), message);
}

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

export const planSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome del piano").max(120, "Massimo 120 caratteri"),
  kind: z.enum(["ENROLLMENT", "MONTHLY", "EXTRA"]),
  amount: z
    .string()
    .refine((value) => parseEuroToCents(value) !== null, "Inserisci un importo valido, per esempio 60 o 60,50"),
  teamId: z.string(),
  installments: optionalInteger(1, 36, "Inserisci un numero da 1 a 36"),
  dueDay: optionalInteger(1, 28, "Inserisci un giorno da 1 a 28"),
  isActive: z.boolean(),
});

export type PlanValues = z.infer<typeof planSchema>;

/** Body for POST (create) and PATCH (update): cleared optional fields are sent as `null` on update. */
export function toPlanBody(values: PlanValues, mode: "create" | "update"): FeePlanBody {
  const cents = parseEuroToCents(values.amount);
  if (cents === null) throw new Error("Invalid amount: validate with planSchema first");
  const optional = <T>(value: T | null): T | null | undefined => (value === null && mode === "create" ? undefined : value);
  return {
    name: values.name,
    kind: values.kind,
    amountCents: cents,
    teamId: optional(values.teamId === "" ? null : values.teamId),
    installments: optional(values.installments === "" ? null : Number(values.installments)),
    dueDay: optional(values.dueDay === "" ? null : Number(values.dueDay)),
    isActive: values.isActive,
  };
}

// ---------------------------------------------------------------------------
// Fee generation
// ---------------------------------------------------------------------------

export const generateSchema = z.object({
  dueDate: dayText,
  description: z.string().trim().max(200, "Massimo 200 caratteri"),
});

export type GenerateValues = z.infer<typeof generateSchema>;

export function toGenerateBody(values: GenerateValues): GenerateFeesBody {
  return values.description ? { dueDate: values.dueDate, description: values.description } : { dueDate: values.dueDate };
}
