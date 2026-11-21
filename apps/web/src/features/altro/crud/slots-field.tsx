"use client";

import { Plus, X } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Alert, Button, IconButton, Input, Select } from "@/components/ui";
import { parseSlots, serializeSlots, WEEKDAYS } from "../venue-slots";
import type { VenueSlot } from "../types";
import type { FieldDef, FormValues } from "./types";

export interface SlotsFieldProps {
  field: FieldDef;
  form: UseFormReturn<FormValues>;
  error?: string;
}

const NEW_SLOT: VenueSlot = { weekday: 2, from: "18:00", to: "19:00" };
const DAY_OPTIONS = WEEKDAYS.map((day) => ({ value: String(day.value), label: day.label }));

/**
 * The weekly hours of a place, written by the person as a list: the day and the time it can be used from and to, as many
 * rows as needed. The list lives in the form as JSON text (every field of the form is text); the rows keep the order
 * they were written in while the person edits, and the API gives them back by day and time.
 */
export function SlotsField({ field, form, error }: SlotsFieldProps) {
  const slots = parseSlots(form.watch(field.name) ?? "[]");
  const write = (next: readonly VenueSlot[]) => form.setValue(field.name, serializeSlots(next), { shouldDirty: true, shouldValidate: true });
  const change = (index: number, patch: Partial<VenueSlot>) => write(slots.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)));
  // A new row follows the last one: the next day at the same hours, which is how a week is usually written
  const last = slots.at(-1);
  const add = () => write([...slots, last ? { ...last, weekday: (last.weekday % 7) + 1 } : NEW_SLOT]);

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="text-sm font-bold text-fg">{field.label}</legend>
      {field.hint ? <p className="-mt-1 text-sm text-fg-muted">{field.hint}</p> : null}
      {slots.length === 0 ? <p className="text-sm text-fg-muted">Nessun orario fissato.</p> : null}
      {slots.length > 0 ? (
        <div aria-hidden="true" className="hidden grid-cols-[2fr_1fr_1fr_2.75rem] gap-2 text-xs font-bold uppercase tracking-label text-fg-muted sm:grid">
          <span>Giorno</span>
          <span>Dalle</span>
          <span>Alle</span>
          <span />
        </div>
      ) : null}
      <ul aria-label={field.label} className="flex flex-col gap-3">
        {slots.map((slot, index) => (
          <li key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Select
              label={`Giorno dell'orario ${index + 1}`}
              hideLabel
              className="col-span-3 sm:col-span-1"
              options={DAY_OPTIONS}
              value={String(slot.weekday)}
              onChange={(event) => change(index, { weekday: Number(event.target.value) })}
            />
            <Input label={`Dalle, orario ${index + 1}`} hideLabel type="time" value={slot.from} onChange={(event) => change(index, { from: event.target.value })} />
            <Input label={`Alle, orario ${index + 1}`} hideLabel type="time" value={slot.to} onChange={(event) => change(index, { to: event.target.value })} />
            <IconButton aria-label={`Togli l'orario ${index + 1}`} icon={<X />} onClick={() => write(slots.filter((_, position) => position !== index))} />
          </li>
        ))}
      </ul>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="button" variant="secondary" size="sm" leftIcon={<Plus />} className="w-fit" onClick={add}>
        Aggiungi un orario
      </Button>
    </fieldset>
  );
}
