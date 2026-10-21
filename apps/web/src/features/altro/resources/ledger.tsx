import { Banknote } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui";
import { formatDay, formatEuro } from "@/lib/format";
import { toDayKey } from "@/lib/dates";
import type { ResourceConfig } from "../crud/types";
import { amountToInput, bodyReader, optionalText, parseAmount, requiredAmount, requiredDay, requiredText } from "../crud/values";
import type { LedgerEntry, LedgerKind, LedgerSource } from "../types";

export const KIND_LABELS: Record<LedgerKind, string> = { INCOME: "Entrata", EXPENSE: "Uscita" };

const schema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]),
  category: requiredText(60, "Inserisci la categoria"),
  amount: requiredAmount(1),
  occurredOn: requiredDay(),
  description: optionalText(500),
});

const SOURCE_NOTES: Record<LedgerSource, string> = {
  PAYMENT: "Registrato dai pagamenti: si modifica da lì.",
  VENUE: "Costo di una palestra: si modifica dalla palestra.",
  KIT: "Costo di una divisa: si modifica dalla divisa.",
  TRIP: "Costo di una trasferta: si modifica dalla trasferta.",
};

/** Signed amount for a list row: the sign and the kind badge carry the meaning, not the colour. */
function signedAmount(entry: LedgerEntry): string {
  return `${entry.kind === "INCOME" ? "+" : "−"} ${formatEuro(entry.amountCents)}`;
}

export const ledgerConfig: ResourceConfig<LedgerEntry> = {
  key: "ledger",
  path: "/ledger/entries",
  writePermission: "ledger:write",
  attachmentType: "LEDGER_ENTRY",
  icon: Banknote,
  fieldAliases: { amountCents: "amount" },
  // Entries born from a payment or from the cost of a venue, kit or trip follow their source: changing them here would desync the two.
  isReadOnly: (entry) => entry.source !== null,
  copy: {
    plural: "Movimenti",
    loadingLabel: "Caricamento dei movimenti",
    newLabel: "Nuovo movimento",
    createTitle: "Nuovo movimento",
    createDescription: "Registra un'entrata o un'uscita con la sua categoria.",
    createSubmit: "Registra il movimento",
    editTitle: "Modifica il movimento",
    editDescription: "I totali dell'anno si aggiornano da soli.",
    createdToast: "Movimento registrato",
    updatedToast: "Movimento aggiornato",
    deletedToast: "Movimento eliminato",
    emptyTitle: "Nessun movimento",
    emptyDescription: "Registra le entrate e le uscite della società: i totali dell'anno si calcolano da soli.",
    deleteDescription: "Il movimento esce dal bilancio. L'azione non si può annullare.",
    countNoun: "Movimenti",
    moreLabel: "Mostra altri movimenti",
  },
  filter: {
    label: "Filtra per tipo",
    param: "kind",
    options: [
      { value: "", label: "Tutti i tipi" },
      { value: "INCOME", label: "Entrate" },
      { value: "EXPENSE", label: "Uscite" },
    ],
  },
  fields: [
    {
      name: "kind",
      label: "Tipo",
      kind: "select",
      options: (Object.keys(KIND_LABELS) as LedgerKind[]).map((value) => ({ value, label: KIND_LABELS[value] })),
      half: true,
    },
    { name: "occurredOn", label: "Data", kind: "date", required: true, half: true },
    { name: "category", label: "Categoria", kind: "text", required: true, hint: "Per esempio: Quote, Affitto palestra, Sponsor.", half: true },
    { name: "amount", label: "Importo in euro", kind: "money", required: true, hint: "Per esempio 60 o 60,50.", half: true },
    { name: "description", label: "Descrizione", kind: "textarea" },
  ],
  schema,
  initialValues: (entry) => ({
    kind: entry?.kind ?? "INCOME",
    category: entry?.category ?? "",
    amount: amountToInput(entry?.amountCents ?? null),
    occurredOn: entry?.occurredOn ?? toDayKey(new Date()),
    description: entry?.description ?? "",
  }),
  toBody: (values, mode) => {
    const read = bodyReader(values, mode);
    return {
      kind: read.raw("kind"),
      category: read.raw("category"),
      amountCents: parseAmount(read.raw("amount")),
      occurredOn: read.raw("occurredOn"),
      description: read.text("description"),
    };
  },
  nameOf: (entry) => `${entry.category} del ${formatDay(entry.occurredOn)}`,
  row: (entry) => ({
    title: entry.category,
    lines: [entry.description, formatDay(entry.occurredOn), entry.source ? SOURCE_NOTES[entry.source] : null],
    figure: (
      <span className={entry.kind === "INCOME" ? "text-base font-extrabold text-success" : "text-base font-extrabold text-fg"}>
        {signedAmount(entry)}
      </span>
    ),
    status: <Badge variant={entry.kind === "INCOME" ? "success" : "neutral"}>{KIND_LABELS[entry.kind]}</Badge>,
  }),
};
