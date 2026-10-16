import { Bus } from "lucide-react";
import { z } from "zod";
import { Badge, type BadgeVariant } from "@/components/ui";
import { formatEuro } from "@/lib/format";
import type { ResourceConfig } from "../crud/types";
import {
  amountToInput,
  bodyReader,
  numberToInput,
  optionalAmount,
  optionalDateTime,
  optionalInteger,
  optionalText,
  requiredDateTime,
  requiredText,
  toLocalInput,
} from "../crud/values";
import { formatWhen, joinParts } from "../format";
import type { Trip, TripStatus, TripTransport } from "../types";

const TRANSPORT_LABELS: Record<TripTransport, string> = { CAR: "Auto", MINIBUS: "Pulmino", OTHER: "Altro mezzo" };
const STATUS_LABELS: Record<TripStatus, string> = { PLANNED: "Pianificata", CONFIRMED: "Confermata", CANCELLED: "Annullata" };
const STATUS_VARIANTS: Record<TripStatus, BadgeVariant> = { PLANNED: "brand", CONFIRMED: "success", CANCELLED: "danger" };

const schema = z
  .object({
    destination: requiredText(200, "Inserisci la destinazione"),
    departAt: requiredDateTime(),
    returnAt: optionalDateTime(),
    transport: z.enum(["CAR", "MINIBUS", "OTHER"]),
    seats: optionalInteger(1, 100),
    cost: optionalAmount(),
    status: z.enum(["PLANNED", "CONFIRMED", "CANCELLED"]),
    notes: optionalText(1000),
  })
  .refine((values) => values.returnAt === "" || values.departAt === "" || new Date(values.returnAt) >= new Date(values.departAt), {
    message: "Il ritorno non può essere prima della partenza",
    path: ["returnAt"],
  });

function options<K extends string>(labels: Record<K, string>) {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}

export const tripsConfig: ResourceConfig<Trip> = {
  key: "trips",
  path: "/trips",
  writePermission: "trips:write",
  attachmentType: "TRIP",
  icon: Bus,
  fieldAliases: { costCents: "cost" },
  copy: {
    plural: "Trasferte",
    loadingLabel: "Caricamento delle trasferte",
    newLabel: "Nuova trasferta",
    createTitle: "Nuova trasferta",
    createDescription: "Destinazione, orari, mezzo e costo: così chi parte sa cosa aspettarsi.",
    createSubmit: "Crea la trasferta",
    editTitle: "Modifica la trasferta",
    editDescription: "Le modifiche valgono da subito per tutta la società.",
    createdToast: "Trasferta creata",
    updatedToast: "Trasferta aggiornata",
    deletedToast: "Trasferta eliminata",
    emptyTitle: "Nessuna trasferta",
    emptyDescription: "Organizza la prossima trasferta con destinazione, orari, mezzo e costi.",
    deleteDescription: "La trasferta sparisce dall'elenco. L'azione non si può annullare.",
    countNoun: "Trasferte",
    moreLabel: "Mostra altre trasferte",
  },
  filter: {
    label: "Filtra per stato",
    param: "status",
    options: [{ value: "", label: "Tutte" }, ...options(STATUS_LABELS)],
  },
  fields: [
    { name: "destination", label: "Destinazione", kind: "text", required: true },
    { name: "departAt", label: "Partenza", kind: "datetime", required: true, half: true },
    { name: "returnAt", label: "Ritorno", kind: "datetime", half: true },
    { name: "transport", label: "Mezzo", kind: "select", options: options(TRANSPORT_LABELS), half: true },
    { name: "seats", label: "Posti disponibili", kind: "integer", half: true },
    { name: "cost", label: "Costo totale in euro", kind: "money", hint: "Facoltativo, per esempio 120 o 120,50.", half: true },
    { name: "status", label: "Stato", kind: "select", options: options(STATUS_LABELS), half: true },
    { name: "notes", label: "Note", kind: "textarea" },
  ],
  schema,
  initialValues: (trip) => ({
    destination: trip?.destination ?? "",
    departAt: trip ? toLocalInput(trip.departAt) : "",
    returnAt: trip?.returnAt ? toLocalInput(trip.returnAt) : "",
    transport: trip?.transport ?? "CAR",
    seats: numberToInput(trip?.seats ?? null),
    cost: amountToInput(trip?.costCents ?? null),
    status: trip?.status ?? "PLANNED",
    notes: trip?.notes ?? "",
  }),
  toBody: (values, mode) => {
    const read = bodyReader(values, mode);
    return {
      destination: read.raw("destination"),
      departAt: read.dateTime("departAt"),
      returnAt: read.dateTime("returnAt"),
      transport: read.raw("transport"),
      seats: read.integer("seats"),
      costCents: read.amount("cost"),
      status: read.raw("status"),
      notes: read.text("notes"),
    };
  },
  nameOf: (trip) => trip.destination,
  row: (trip) => ({
    title: trip.destination,
    lines: [
      joinParts([`Partenza ${formatWhen(trip.departAt)}`, trip.returnAt ? `ritorno ${formatWhen(trip.returnAt)}` : null], ", "),
      joinParts([
        TRANSPORT_LABELS[trip.transport],
        trip.seats !== null ? `${trip.seats} posti` : null,
        trip.costCents !== null ? formatEuro(trip.costCents) : null,
      ]),
      trip.notes,
    ],
    status: <Badge variant={STATUS_VARIANTS[trip.status]}>{STATUS_LABELS[trip.status]}</Badge>,
  }),
};
