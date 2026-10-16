import { z } from "zod";
import { centsToInput } from "@/lib/format";
import type { FormMode, FormValues } from "./types";

/** Largest amount the API accepts (euro cents). */
const MAX_AMOUNT_CENTS = 1_000_000_000;

/** "60" / "60,5" / "1.250,00" / "1.500" -> cents (0 included); null when the text is not a valid amount. */
export function parseAmount(input: string): number | null {
  const text = input.replace(/[\s€]/g, "");
  // A dot followed by exactly three digits is a thousands separator ("1.500"), otherwise a decimal point ("60.5").
  const hasThousandsDots = /^\d{1,3}(\.\d{3})+$/.test(text);
  const normalized = text.includes(",") || hasThousandsDots ? text.replace(/\./g, "").replace(",", ".") : text;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/** ISO instant -> value of an `<input type="datetime-local">` in local time. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

// ---------------------------------------------------------------------------
// Form schemas. Limits mirror apps/api/src/modules/<resource>/schema.ts.
// ---------------------------------------------------------------------------

export function requiredText(max: number, message: string) {
  return z.string().trim().min(1, message).max(max, `Massimo ${max} caratteri`);
}

export function optionalText(max: number) {
  return z.string().trim().max(max, `Massimo ${max} caratteri`);
}

export function optionalEmail() {
  return z
    .string()
    .trim()
    .max(254, "L'email è troppo lunga")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Inserisci un'email valida");
}

export function optionalPhone() {
  return z
    .string()
    .trim()
    .max(40, "Massimo 40 caratteri")
    .refine((value) => value === "" || value.length >= 3, "Inserisci almeno 3 caratteri");
}

export function optionalInteger(min: number, max: number) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= min && Number(value) <= max), `Inserisci un numero da ${min} a ${max}`);
}

export function requiredDay() {
  return z.iso.date("Inserisci una data valida");
}

export function optionalDay() {
  return z.string().refine((value) => value === "" || z.iso.date().safeParse(value).success, "Inserisci una data valida");
}

export function requiredDateTime() {
  return z.string().refine((value) => value !== "" && !Number.isNaN(new Date(value).getTime()), "Inserisci data e ora");
}

export function optionalDateTime() {
  return z.string().refine((value) => value === "" || !Number.isNaN(new Date(value).getTime()), "Inserisci data e ora");
}

const AMOUNT_MESSAGE = "Inserisci un importo valido, per esempio 60 o 60,50";

export function requiredAmount(minCents = 0) {
  return z.string().refine((value) => {
    const cents = parseAmount(value);
    return cents !== null && cents >= minCents;
  }, minCents > 0 ? "Inserisci un importo maggiore di zero, per esempio 60 o 60,50" : AMOUNT_MESSAGE);
}

export function optionalAmount() {
  return z.string().refine((value) => value.trim() === "" || parseAmount(value) !== null, AMOUNT_MESSAGE);
}

// ---------------------------------------------------------------------------
// Request bodies. On create an empty optional field is left out; on update it is sent as `null` so the server clears it.
// ---------------------------------------------------------------------------

function clearable<T>(value: T | null, mode: FormMode): T | null | undefined {
  return value === null && mode === "create" ? undefined : value;
}

/** Reads form values for a request body: `raw` for required fields, the others follow the create/update rule above. */
export function bodyReader(values: FormValues, mode: FormMode) {
  const raw = (name: string): string => (values[name] ?? "").trim();
  return {
    raw,
    text: (name: string) => clearable(raw(name) === "" ? null : raw(name), mode),
    integer: (name: string) => clearable(raw(name) === "" ? null : Number(raw(name)), mode),
    amount: (name: string) => clearable(raw(name) === "" ? null : parseAmount(raw(name)), mode),
    dateTime: (name: string) => clearable(raw(name) === "" ? null : fromLocalInput(raw(name)), mode),
  };
}

/** Cents as the text of an amount input, or "" when there is none. */
export function amountToInput(cents: number | null): string {
  return cents === null ? "" : centsToInput(cents);
}

export function numberToInput(value: number | null): string {
  return value === null ? "" : String(value);
}
