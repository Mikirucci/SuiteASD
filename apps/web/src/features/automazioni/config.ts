import { z } from "zod";
import type { JsonObject } from "./types";

/**
 * Settings of each automation, mirroring the per-key schemas of apps/api/src/jobs/catalog.ts.
 * Form values are strings (HTML inputs); `toConfigBody` converts them after validation.
 */

export type ConfigField =
  | { type: "days"; name: string; label: string; hint: string; min: number; max: number; maxItems: number }
  | { type: "number"; name: string; label: string; hint: string; min: number; max: number }
  | { type: "toggle"; name: string; label: string; hint: string };

export type ConfigFormValues = Record<string, string | boolean>;
export type ConfigBody = Record<string, number | number[] | boolean>;

interface ConfigSpec {
  fields: readonly ConfigField[];
  /** Read-only lines shown on the checklist row, e.g. "Promemoria: 1 e 7 giorni prima". */
  summarize: (config: JsonObject) => string[];
}

const listFormat = new Intl.ListFormat("it", { style: "long", type: "conjunction" });

export function pluralDays(count: number): string {
  return `${count} ${count === 1 ? "giorno" : "giorni"}`;
}

function numbersOf(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** "1 e 7 giorni prima": the unit follows the last number of the list. */
function daysList(days: number[], suffix: string): string {
  if (days.length === 0) return "nessuno";
  const last = days[days.length - 1] ?? 0;
  return `${listFormat.format(days.map(String))} ${last === 1 ? "giorno" : "giorni"} ${suffix}`;
}

const CONFIG_SPECS: Record<string, ConfigSpec> = {
  "fee-reminders": {
    fields: [
      {
        type: "days",
        name: "beforeDueDays",
        label: "Promemoria prima della scadenza",
        hint: "Giorni prima della scadenza, separati da virgola: per esempio 1, 7. Fino a 5 valori da 1 a 60.",
        min: 1,
        max: 60,
        maxItems: 5,
      },
      {
        type: "days",
        name: "afterDueDays",
        label: "Solleciti dopo la scadenza",
        hint: "Giorni dopo la scadenza, separati da virgola: per esempio 3, 10. Fino a 5 valori da 1 a 120.",
        min: 1,
        max: 120,
        maxItems: 5,
      },
    ],
    summarize: (config) => [
      `Promemoria: ${daysList(numbersOf(config.beforeDueDays), "prima della scadenza")}`,
      `Solleciti: ${daysList(numbersOf(config.afterDueDays), "dopo la scadenza")}`,
    ],
  },
  "certificate-reminders": {
    fields: [
      {
        type: "days",
        name: "thresholdsDays",
        label: "Avvisi prima della scadenza",
        hint: "Giorni prima della scadenza, separati da virgola: per esempio 7, 15, 30. Con 0 l'avviso parte anche a scadenza avvenuta. Fino a 6 valori da 0 a 365.",
        min: 0,
        max: 365,
        maxItems: 6,
      },
    ],
    summarize: (config) => {
      const days = numbersOf(config.thresholdsDays);
      const before = days.filter((day) => day > 0);
      const parts = [
        ...(days.includes(0) ? ["alla scadenza"] : []),
        ...(before.length > 0 ? [daysList(before, "prima")] : []),
      ];
      return [`Avvisi: ${parts.length > 0 ? parts.join(", ") : "nessuno"}`];
    },
  },
  "convocation-dispatch": {
    fields: [
      {
        type: "number",
        name: "daysBefore",
        label: "Invio delle convocazioni",
        hint: "Quanti giorni prima dell'evento partono le convocazioni, da 1 a 30.",
        min: 1,
        max: 30,
      },
      {
        type: "toggle",
        name: "remindNonRespondents",
        label: "Ricorda a chi non ha risposto",
        hint: "Chi non ha ancora risposto riceve un promemoria.",
      },
      {
        type: "number",
        name: "reminderDaysBefore",
        label: "Promemoria a chi non ha risposto",
        hint: "Quanti giorni prima dell'evento, da 0 a 14. Con 0 il promemoria parte il giorno stesso.",
        min: 0,
        max: 14,
      },
    ],
    summarize: (config) => {
      const daysBefore = numberOf(config.daysBefore);
      const reminder = numberOf(config.reminderDaysBefore);
      const lines = [daysBefore === null ? "" : `Convocazioni: ${pluralDays(daysBefore)} prima dell'evento`];
      if (config.remindNonRespondents === true && reminder !== null) {
        lines.push(`Promemoria a chi non risponde: ${reminder === 0 ? "il giorno dell'evento" : `${pluralDays(reminder)} prima`}`);
      } else {
        lines.push("Promemoria a chi non risponde: disattivato");
      }
      return lines.filter((line) => line !== "");
    },
  },
  "notifications-dispatch": {
    fields: [
      {
        type: "number",
        name: "maxAttempts",
        label: "Tentativi per ogni email",
        hint: "Dopo quanti invii falliti si smette di riprovare, da 1 a 10.",
        min: 1,
        max: 10,
      },
      {
        type: "number",
        name: "batchSize",
        label: "Email per ogni ciclo",
        hint: "Quante email si recapitano a ogni esecuzione, da 1 a 500.",
        min: 1,
        max: 500,
      },
    ],
    summarize: (config) => {
      const attempts = numberOf(config.maxAttempts);
      const batch = numberOf(config.batchSize);
      return [
        ...(attempts === null ? [] : [`Tentativi per email: ${attempts}`]),
        ...(batch === null ? [] : [`Email per ciclo: fino a ${batch}`]),
      ];
    },
  },
};

export function configFieldsOf(key: string): readonly ConfigField[] {
  return CONFIG_SPECS[key]?.fields ?? [];
}

export function summarizeConfig(key: string, config: JsonObject): string[] {
  return CONFIG_SPECS[key]?.summarize(config) ?? [];
}

const INTEGER = /^\d+$/;

function parseDays(text: string, field: Extract<ConfigField, { type: "days" }>): number[] | string {
  const tokens = text.split(/[\s,;]+/).filter((token) => token !== "");
  if (tokens.length > field.maxItems) return `Al massimo ${field.maxItems} valori`;
  const days: number[] = [];
  for (const token of tokens) {
    if (!INTEGER.test(token) || Number(token) < field.min || Number(token) > field.max) {
      return `Ogni valore va da ${field.min} a ${field.max}`;
    }
    days.push(Number(token));
  }
  return days;
}

function parseNumber(text: string, field: Extract<ConfigField, { type: "number" }>): number | string {
  const trimmed = text.trim();
  if (!INTEGER.test(trimmed) || Number(trimmed) < field.min || Number(trimmed) > field.max) {
    return `Inserisci un numero da ${field.min} a ${field.max}`;
  }
  return Number(trimmed);
}

export function configFormSchema(fields: readonly ConfigField[]) {
  return z.record(z.string(), z.union([z.string(), z.boolean()])).superRefine((values, ctx) => {
    for (const field of fields) {
      const value = values[field.name];
      if (field.type === "toggle") continue;
      const parsed = typeof value === "string" ? (field.type === "days" ? parseDays(value, field) : parseNumber(value, field)) : "Campo obbligatorio";
      if (typeof parsed === "string") ctx.addIssue({ code: "custom", path: [field.name], message: parsed });
    }
  });
}

/** Form values from the stored settings. */
export function toFormValues(fields: readonly ConfigField[], config: JsonObject): ConfigFormValues {
  const values: ConfigFormValues = {};
  for (const field of fields) {
    const stored = config[field.name];
    if (field.type === "days") values[field.name] = numbersOf(stored).join(", ");
    else if (field.type === "number") values[field.name] = typeof stored === "number" ? String(stored) : "";
    else values[field.name] = stored === true;
  }
  return values;
}

/** Request body for the validated form values; fields that fail to parse are left out (the schema rejects them first). */
export function toConfigBody(fields: readonly ConfigField[], values: ConfigFormValues): ConfigBody {
  const body: ConfigBody = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.type === "toggle") {
      body[field.name] = value === true;
      continue;
    }
    if (typeof value !== "string") continue;
    const parsed = field.type === "days" ? parseDays(value, field) : parseNumber(value, field);
    if (typeof parsed !== "string") body[field.name] = parsed;
  }
  return body;
}
