import { Receipt } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui";
import { toDayKey } from "@/lib/dates";
import { formatDay, formatEuro } from "@/lib/format";
import type { ResourceConfig } from "../crud/types";
import { amountToInput, bodyReader, optionalText, parseAmount, requiredAmount, requiredDay, requiredText } from "../crud/values";
import type { LedgerEntry, LedgerSource } from "../types";
import { SOURCE_NOTES } from "./ledger";

const schema = z.object({
  description: requiredText(120, "Dai un nome alla spesa"),
  category: requiredText(60, "Scegli o scrivi la categoria"),
  amount: requiredAmount(1),
  occurredOn: requiredDay(),
  supplier: optionalText(120),
  notes: optionalText(1000),
});

/** What a linked expense comes from, in one word: the badge on the row says where to change it. */
const SOURCE_LABELS: Record<LedgerSource, string> = {
  PAYMENT: "Pagamento",
  VENUE: "Palestra",
  KIT: "Divisa",
  TRIP: "Trasferta",
  REFEREE: "Arbitro",
};

/**
 * The expenses of the club: the ones entered here (balls, nets, insurance, fees...) and, read-only, the costs that
 * the other sections book on their own (venues, kits, trips, referees). All of them are entries of the balance.
 */
export const expensesConfig: ResourceConfig<LedgerEntry> = {
  key: "ledger",
  path: "/ledger/entries",
  writePermission: "ledger:write",
  attachmentType: "LEDGER_ENTRY",
  icon: Receipt,
  fieldAliases: { amountCents: "amount" },
  // The cost of a venue, kit, trip or referee follows its source: it is changed there, not here
  isReadOnly: (entry) => entry.source !== null,
  copy: {
    plural: "Spese",
    loadingLabel: "Caricamento delle spese",
    newLabel: "Nuova spesa",
    createTitle: "Nuova spesa",
    createDescription: "Registra una spesa: entra subito nel bilancio, nella sua categoria.",
    createSubmit: "Registra la spesa",
    editTitle: "Modifica la spesa",
    editDescription: "Il bilancio si aggiorna da solo.",
    createdToast: "Spesa registrata",
    updatedToast: "Spesa aggiornata",
    deletedToast: "Spesa eliminata",
    emptyTitle: "Nessuna spesa",
    emptyDescription: "Registra palloni, iscrizioni, assicurazioni e ogni altra spesa: finiscono da sole nel bilancio.",
    deleteDescription: "La spesa esce dal bilancio. L'azione non si può annullare.",
    countNoun: "Spese",
    moreLabel: "Mostra altre spese",
  },
  searchLabel: "Cerca una spesa",
  filter: {
    label: "Filtra per origine",
    param: "origin",
    options: [
      { value: "", label: "Tutte" },
      { value: "MANUAL", label: "Registrate qui" },
      { value: "LINKED", label: "Da palestre, divise, trasferte, arbitri" },
    ],
  },
  fields: [
    { name: "description", label: "Nome della spesa", kind: "text", required: true, hint: "Per esempio: Palloni da gara." },
    {
      name: "category",
      label: "Categoria",
      kind: "suggest",
      required: true,
      hint: "Scegli una categoria che esiste già o scrivine una nuova.",
      suggestions: { path: "/ledger/categories", query: { kind: "EXPENSE" } },
      half: true,
    },
    { name: "occurredOn", label: "Data", kind: "date", required: true, half: true },
    { name: "amount", label: "Importo in euro", kind: "money", required: true, hint: "Per esempio 60 o 60,50.", half: true },
    { name: "supplier", label: "Fornitore", kind: "text", hint: "A chi hai pagato, se vuoi ricordarlo.", half: true },
    { name: "notes", label: "Note", kind: "textarea", hint: "Per esempio il numero della fattura." },
  ],
  schema,
  initialValues: (entry) => ({
    description: entry?.description ?? "",
    category: entry?.category ?? "",
    amount: amountToInput(entry?.amountCents ?? null),
    occurredOn: entry?.occurredOn ?? toDayKey(new Date()),
    supplier: entry?.supplier ?? "",
    notes: entry?.notes ?? "",
  }),
  toBody: (values, mode) => {
    const read = bodyReader(values, mode);
    return {
      ...(mode === "create" ? { kind: "EXPENSE" } : {}),
      description: read.raw("description"),
      category: read.raw("category"),
      amountCents: parseAmount(read.raw("amount")),
      occurredOn: read.raw("occurredOn"),
      supplier: read.text("supplier"),
      notes: read.text("notes"),
    };
  },
  nameOf: (entry) => entry.description ?? entry.category,
  row: (entry) => ({
    title: entry.description ?? entry.category,
    lines: [
      [entry.category, entry.supplier].filter(Boolean).join(" · "),
      formatDay(entry.occurredOn),
      entry.source ? SOURCE_NOTES[entry.source] : null,
    ],
    figure: <span className="text-base font-extrabold text-fg">− {formatEuro(entry.amountCents)}</span>,
    status: entry.source ? <Badge variant="brand">{SOURCE_LABELS[entry.source]}</Badge> : undefined,
  }),
};
