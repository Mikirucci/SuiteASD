import { Building2 } from "lucide-react";
import { z } from "zod";
import type { ResourceConfig } from "../crud/types";
import { bodyReader, numberToInput, optionalInteger, optionalText, requiredText } from "../crud/values";
import { joinParts } from "../format";
import type { Venue } from "../types";

const schema = z.object({
  name: requiredText(120, "Inserisci il nome della palestra"),
  address: optionalText(200),
  city: optionalText(80),
  capacity: optionalInteger(1, 100_000),
  availability: optionalText(500),
  notes: optionalText(1000),
});

export const venuesConfig: ResourceConfig<Venue> = {
  key: "venues",
  path: "/venues",
  writePermission: "venues:write",
  attachmentType: "VENUE",
  icon: Building2,
  searchLabel: "Cerca per nome o città",
  copy: {
    plural: "Palestre",
    loadingLabel: "Caricamento delle palestre",
    newLabel: "Nuova palestra",
    createTitle: "Nuova palestra",
    createDescription: "Indirizzo e orari servono a tutti per sapere dove andare.",
    createSubmit: "Crea la palestra",
    editTitle: "Modifica la palestra",
    editDescription: "Le modifiche valgono da subito per tutta la società.",
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
      name: "availability",
      label: "Orari di disponibilità",
      kind: "textarea",
      hint: "Per esempio: martedì e giovedì 18:00-21:00.",
    },
    { name: "notes", label: "Note", kind: "textarea" },
  ],
  schema,
  initialValues: (venue) => ({
    name: venue?.name ?? "",
    address: venue?.address ?? "",
    city: venue?.city ?? "",
    capacity: numberToInput(venue?.capacity ?? null),
    availability: venue?.availability ?? "",
    notes: venue?.notes ?? "",
  }),
  toBody: (values, mode) => {
    const read = bodyReader(values, mode);
    return {
      name: read.raw("name"),
      address: read.text("address"),
      city: read.text("city"),
      capacity: read.integer("capacity"),
      availability: read.text("availability"),
      notes: read.text("notes"),
    };
  },
  nameOf: (venue) => venue.name,
  row: (venue) => ({
    title: venue.name,
    lines: [
      joinParts([venue.address, venue.city]),
      venue.availability ? `Orari: ${venue.availability}` : null,
      venue.capacity !== null ? `Capienza: ${venue.capacity} persone` : null,
    ],
  }),
};
