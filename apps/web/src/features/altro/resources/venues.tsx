import { Building2 } from "lucide-react";
import { z } from "zod";
import type { ResourceConfig } from "../crud/types";
import { formatEuro } from "@/lib/format";
import { amountToInput, bodyReader, numberToInput, optionalDay, optionalInteger, optionalPositiveAmount, optionalText, requiredText } from "../crud/values";
import { joinParts } from "../format";
import { parseSlots, serializeSlots, slotsProblem } from "../venue-slots";
import type { Venue } from "../types";

const schema = z.object({
  name: requiredText(120, "Inserisci il nome della palestra"),
  address: optionalText(200),
  city: optionalText(80),
  capacity: optionalInteger(1, 100_000),
  slots: z.string().refine((value) => slotsProblem(parseSlots(value)) === null, { message: "Controlla gli orari: la fine deve essere dopo l'inizio e due orari dello stesso giorno non possono sovrapporsi." }),
  availability: optionalText(500),
  notes: optionalText(1000),
  cost: optionalPositiveAmount(),
  costDate: optionalDay(),
});

export const venuesConfig: ResourceConfig<Venue> = {
  key: "venues",
  path: "/venues",
  writePermission: "venues:write",
  attachmentType: "VENUE",
  openOnClick: true,
  icon: Building2,
  fieldAliases: { costCents: "cost" },
  searchLabel: "Cerca per nome o città",
  copy: {
    plural: "Palestre",
    loadingLabel: "Caricamento delle palestre",
    newLabel: "Nuova palestra",
    createTitle: "Nuova palestra",
    createDescription: "Indirizzo e orari servono a tutti per sapere dove andare.",
    createSubmit: "Crea la palestra",
    editTitle: "Modifica la palestra",
    editDescription: "Cambia indirizzo, orari e costo, e allega i documenti: le modifiche valgono da subito.",
    createdToast: "Palestra creata",
    updatedToast: "Palestra aggiornata",
    deletedToast: "Palestra eliminata",
    emptyTitle: "Nessuna palestra",
    emptyDescription: "Aggiungi gli impianti dove vi allenate, con indirizzo e orari di disponibilità.",
    deleteDescription: "La palestra sparisce dall'elenco. L'azione non si può annullare.",
    countNoun: "Palestre",
    moreLabel: "Mostra altre palestre",
  },
  fields: [
    { name: "name", label: "Nome della palestra", kind: "text", required: true },
    { name: "address", label: "Indirizzo", kind: "text", half: true },
    { name: "city", label: "Città", kind: "text", half: true },
    { name: "capacity", label: "Capienza", kind: "integer", hint: "Facoltativa, numero di persone.", half: true },
    {
      name: "slots",
      label: "Orari fissi",
      kind: "slots",
      hint: "Quando potete usare la palestra: scegli il giorno e dalle a che ora alle a che ora. Aggiungi un orario per ogni giorno.",
    },
    { name: "availability", label: "Altro", kind: "textarea", hint: "Quello che gli orari non dicono, per esempio: anche il sabato per le gare." },
    { name: "cost", label: "Costo in euro", kind: "money", hint: "Facoltativo: finisce tra le uscite del bilancio.", half: true },
    { name: "costDate", label: "Data del costo", kind: "date", hint: "Se la lasci vuota vale oggi.", half: true },
    { name: "notes", label: "Note", kind: "textarea" },
  ],
  schema,
  initialValues: (venue) => ({
    name: venue?.name ?? "",
    address: venue?.address ?? "",
    city: venue?.city ?? "",
    capacity: numberToInput(venue?.capacity ?? null),
    slots: serializeSlots(venue?.slots ?? []),
    availability: venue?.availability ?? "",
    notes: venue?.notes ?? "",
    cost: amountToInput(venue?.costCents ?? null),
    costDate: venue?.costDate ?? "",
  }),
  toBody: (values, mode) => {
    const read = bodyReader(values, mode);
    return {
      name: read.raw("name"),
      address: read.text("address"),
      city: read.text("city"),
      capacity: read.integer("capacity"),
      // Always sent: an empty list is how the hours are taken away
      slots: parseSlots(read.raw("slots")),
      availability: read.text("availability"),
      notes: read.text("notes"),
      costCents: read.amount("cost"),
      costDate: read.day("costDate"),
    };
  },
  nameOf: (venue) => venue.name,
  // The card keeps what tells venues apart: where it is, how big, what it costs. Hours and notes are in the detail
  row: (venue) => ({
    title: venue.name,
    leading: (
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-brand-700">
        <Building2 className="size-5" />
      </span>
    ),
    lines: [joinParts([venue.address, venue.city]), venue.capacity !== null ? `Capienza ${venue.capacity} persone` : null],
    figure: venue.costCents !== null ? <span className="ml-auto text-base font-extrabold text-fg">{formatEuro(venue.costCents)}</span> : undefined,
  }),
};
