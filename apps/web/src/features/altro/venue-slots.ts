import { z } from "zod";
import type { VenueSlot } from "./types";

/** Monday is 1, as in the API. */
export const WEEKDAYS: ReadonlyArray<{ value: number; label: string; short: string }> = [
  { value: 1, label: "Lunedì", short: "Lun" },
  { value: 2, label: "Martedì", short: "Mar" },
  { value: 3, label: "Mercoledì", short: "Mer" },
  { value: 4, label: "Giovedì", short: "Gio" },
  { value: 5, label: "Venerdì", short: "Ven" },
  { value: 6, label: "Sabato", short: "Sab" },
  { value: 7, label: "Domenica", short: "Dom" },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// The times are not checked here: while a row is being edited its time can be empty for a moment, and the row must stay
const slotSchema = z.object({ weekday: z.number().int().min(1).max(7), from: z.string(), to: z.string() });

/**
 * The slots a form value holds (it is JSON text, every form field being text); a value that is not slots is no slots.
 * The rows are as written, even half finished: `slotsProblem` is what says whether they can be saved.
 */
export function parseSlots(value: string): VenueSlot[] {
  try {
    const parsed = z.array(slotSchema).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export const serializeSlots = (slots: readonly VenueSlot[]): string => JSON.stringify(slots);

/** What is wrong with the slots, in words, or null when they can be saved: each ends after it starts, none overlaps another of its day. */
export function slotsProblem(slots: readonly VenueSlot[]): string | null {
  if (slots.some((slot) => !TIME.test(slot.from) || !TIME.test(slot.to))) return "Scrivi l'ora di inizio e quella di fine di ogni orario.";
  if (slots.some((slot) => slot.from >= slot.to)) return "In ogni orario la fine deve essere dopo l'inizio.";
  const ordered = sortSlots(slots);
  const overlap = ordered.some((slot, index) => ordered[index + 1]?.weekday === slot.weekday && (ordered[index + 1] as VenueSlot).from < slot.to);
  return overlap ? "Due orari dello stesso giorno non possono sovrapporsi." : null;
}

export const sortSlots = (slots: readonly VenueSlot[]): VenueSlot[] => [...slots].sort((a, b) => a.weekday - b.weekday || a.from.localeCompare(b.from));

const minutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/** Hours that the slots add up to in a week: "3 h", "4 h 30 min", "45 min". */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const rest = totalMinutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const slotMinutes = (slot: VenueSlot): number => minutes(slot.to) - minutes(slot.from);

/** "Martedì 18:00–19:00": the way a slot reads in a list. */
export function describeSlot(slot: VenueSlot): string {
  const day = WEEKDAYS.find((weekday) => weekday.value === slot.weekday)?.label ?? "";
  return `${day} ${slot.from}–${slot.to}`;
}
