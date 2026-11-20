import { z } from "zod";
import { toDayKey } from "@/lib/dates";
import { parseEuroToCents } from "@/lib/format";
import type { FeePlanBody, PayFeeBody } from "./types";

/** Limits mirror the fee requests of the backend (docs/api/openapi.yaml) so most mistakes are caught before the request. */
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

export const planSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome del piano").max(120, "Massimo 120 caratteri"),
  kind: z.enum(["ENROLLMENT", "MONTHLY", "EXTRA"]),
  amount: z
    .string()
    .refine((value) => parseEuroToCents(value) !== null, "Inserisci un importo valido, per esempio 60 o 60,50"),
  teamId: z.string(),
  installments: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 36, "Inserisci un numero da 1 a 36"),
  firstDueDate: dayText,
  isActive: z.boolean(),
});

export type PlanValues = z.infer<typeof planSchema>;

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** One due date a month for `count` months, starting from `first`; a day the month does not have (the 31st) becomes its last day. */
export function monthlyDueDates(first: string, count: number): string[] {
  const [year = 0, month = 1, day = 1] = first.split("-").map(Number);
  return Array.from({ length: count }, (_, step) => {
    const index = month - 1 + step;
    const dueYear = year + Math.floor(index / 12);
    const dueMonth = index % 12;
    const lastDay = new Date(Date.UTC(dueYear, dueMonth + 1, 0)).getUTCDate();
    return `${dueYear}-${twoDigits(dueMonth + 1)}-${twoDigits(Math.min(day, lastDay))}`;
  });
}

/**
 * Body for POST (create) and PATCH (update). Updating sends only name, kind and state: the form does not show the other
 * fields then, so their values are never read.
 */
export function toPlanBody(values: PlanValues, mode: "create" | "update"): FeePlanBody {
  if (mode === "update") return { name: values.name, kind: values.kind, isActive: values.isActive };
  const cents = parseEuroToCents(values.amount);
  if (cents === null) throw new Error("Invalid amount: validate with planSchema first");
  return {
    name: values.name,
    kind: values.kind,
    amountCents: cents,
    teamIds: values.teamId === "" ? [] : [values.teamId],
    dueDates: monthlyDueDates(values.firstDueDate, Number(values.installments)),
  };
}
