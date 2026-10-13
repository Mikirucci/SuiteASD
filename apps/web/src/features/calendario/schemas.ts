import { z } from "zod";
import { combineLocal, toDateInput, toTimeInput } from "./format";
import type { CalendarEvent, CreateEventBody, RecurrenceBody, UpdateEventBody } from "./types";

/** Limits mirror apps/api/src/modules/events/schema.ts so most mistakes are caught before the request. */
const MAX_OCCURRENCES = 100;
/** Convocation slots when an event does not set its own (apps/api convocations/summary.ts). */
const DEFAULT_CONVOCATIONS = 12;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const EVENT_TYPES = ["MATCH", "TRAINING", "TOURNAMENT", "MEETING"] as const;
const REPEAT_INTERVALS = ["1", "2", "3", "4"] as const;

export const eventFormSchema = z
  .object({
    type: z.enum(EVENT_TYPES),
    title: z.string().trim().min(1, "Inserisci il titolo dell'evento").max(160, "Massimo 160 caratteri"),
    date: z.iso.date("Inserisci una data valida"),
    startTime: z.string().regex(TIME_PATTERN, "Inserisci l'ora di inizio"),
    endTime: z.string().refine((value) => value === "" || TIME_PATTERN.test(value), "Inserisci un'ora valida"),
    teamId: z.string(),
    venueId: z.string(),
    notes: z.string().trim().max(1000, "Massimo 1000 caratteri"),
    maxConvocations: z
      .string()
      .trim()
      .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 40), "Inserisci un numero da 1 a 40"),
    repeat: z.boolean(),
    repeatInterval: z.enum(REPEAT_INTERVALS),
    repeatEnd: z.enum(["count", "until"]),
    repeatCount: z.string().trim(),
    repeatUntil: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.endTime && TIME_PATTERN.test(values.startTime) && values.endTime <= values.startTime) {
      context.addIssue({ code: "custom", path: ["endTime"], message: "La fine deve essere dopo l'inizio" });
    }
    if (!values.repeat || values.type !== "TRAINING") return;
    if (values.repeatEnd === "count") {
      const count = Number(values.repeatCount);
      if (!/^\d+$/.test(values.repeatCount) || count < 2 || count > MAX_OCCURRENCES) {
        context.addIssue({ code: "custom", path: ["repeatCount"], message: `Inserisci un numero da 2 a ${MAX_OCCURRENCES}` });
      }
    } else if (!z.iso.date().safeParse(values.repeatUntil).success || values.repeatUntil <= values.date) {
      context.addIssue({ code: "custom", path: ["repeatUntil"], message: "Scegli un giorno dopo il primo allenamento" });
    }
  });

export type EventValues = z.infer<typeof eventFormSchema>;

export function emptyEventValues(day: string): EventValues {
  return {
    type: "TRAINING",
    title: "",
    date: day,
    startTime: "",
    endTime: "",
    teamId: "",
    venueId: "",
    notes: "",
    maxConvocations: "",
    repeat: false,
    repeatInterval: "1",
    repeatEnd: "count",
    repeatCount: "",
    repeatUntil: "",
  };
}

export function valuesOfEvent(event: CalendarEvent): EventValues {
  return {
    ...emptyEventValues(toDateInput(event.startsAt)),
    type: event.type,
    title: event.title,
    startTime: toTimeInput(event.startsAt),
    endTime: event.endsAt ? toTimeInput(event.endsAt) : "",
    teamId: event.team?.id ?? "",
    venueId: event.venue?.id ?? "",
    notes: event.notes ?? "",
    maxConvocations: event.convocations.capacity === DEFAULT_CONVOCATIONS ? "" : String(event.convocations.capacity),
  };
}

/** Only matches and tournaments convocate a squad: the other events never send a slot count. */
export function hasSquad(type: EventValues["type"]): boolean {
  return type === "MATCH" || type === "TOURNAMENT";
}

function recurrenceOf(values: EventValues): RecurrenceBody | undefined {
  if (!values.repeat || values.type !== "TRAINING") return undefined;
  const base = { frequency: "WEEKLY" as const, interval: Number(values.repeatInterval) };
  return values.repeatEnd === "count" ? { ...base, count: Number(values.repeatCount) } : { ...base, until: values.repeatUntil };
}

export function toCreateBody(values: EventValues): CreateEventBody {
  const body: CreateEventBody = { type: values.type, title: values.title, startsAt: combineLocal(values.date, values.startTime) };
  if (values.endTime) body.endsAt = combineLocal(values.date, values.endTime);
  if (values.teamId) body.teamId = values.teamId;
  if (values.venueId) body.venueId = values.venueId;
  if (values.notes) body.notes = values.notes;
  if (hasSquad(values.type) && values.maxConvocations) body.maxConvocations = Number(values.maxConvocations);
  const recurrence = recurrenceOf(values);
  if (recurrence) body.recurrence = recurrence;
  return body;
}

/** Cleared optional fields are sent as `null`: the API only clears a field that is explicitly null. */
export function toUpdateBody(values: EventValues): UpdateEventBody {
  return {
    title: values.title,
    startsAt: combineLocal(values.date, values.startTime),
    endsAt: values.endTime ? combineLocal(values.date, values.endTime) : null,
    teamId: values.teamId || null,
    venueId: values.venueId || null,
    notes: values.notes || null,
    ...(hasSquad(values.type) ? { maxConvocations: values.maxConvocations ? Number(values.maxConvocations) : null } : {}),
  };
}

// ---- reschedule ----------------------------------------------------------------------------------------------------

export const rescheduleSchema = z.object({
  date: z.iso.date("Inserisci una data valida"),
  startTime: z.string().regex(TIME_PATTERN, "Inserisci l'ora di inizio"),
  venueId: z.string(),
});

export type RescheduleValues = z.infer<typeof rescheduleSchema>;

export function valuesOfReschedule(event: CalendarEvent): RescheduleValues {
  return { date: toDateInput(event.startsAt), startTime: toTimeInput(event.startsAt), venueId: event.venue?.id ?? "" };
}

/** The event keeps its duration: the end moves together with the start. */
export function toRescheduleBody(values: RescheduleValues, event: CalendarEvent): UpdateEventBody {
  const startsAt = combineLocal(values.date, values.startTime);
  const body: UpdateEventBody = { startsAt, venueId: values.venueId || null };
  if (event.endsAt) {
    const duration = new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime();
    body.endsAt = new Date(new Date(startsAt).getTime() + duration).toISOString();
  }
  return body;
}
