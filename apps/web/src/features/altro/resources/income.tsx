import { HandCoins } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui";
import { toDayKey } from "@/lib/dates";
import { formatDay, formatEuro } from "@/lib/format";
import { CategoryTile } from "../category-tile";
import type { ResourceConfig } from "../crud/types";
import { amountToInput, bodyReader, optionalText, parseAmount, requiredAmount, requiredDay, requiredText } from "../crud/values";
import { SOURCES, SourceAlert } from "../ledger-sources";
import type { LedgerEntry } from "../types";

const schema = z.object({
  description: requiredText(120, "Dai un nome all'entrata"),
  category: requiredText(60, "Scegli o scrivi la categoria"),
  amount: requiredAmount(1),
  occurredOn: requiredDay(),
  supplier: optionalText(120),
  notes: optionalText(1000),
});

/**
 * The incomes of the club: the ones entered here (sponsors, contributions, fundraising...) and, read-only, what
 * the other sections book on their own (the fees that are paid, the contracts of the sponsors). The costs have their own section, Spese.
 */
export const incomeConfig: ResourceConfig<LedgerEntry> = {
  key: "ledger",
  path: "/ledger/entries",
  writePermission: "ledger:write",
  attachmentType: "LEDGER_ENTRY",
  openOnClick: true,
  icon: HandCoins,
  fieldAliases: { amountCents: "amount" },
  // An income born from a payment follows it: changing it here would put the balance out of step with the payments
  isReadOnly: (entry) => entry.source !== null,
  detailNote: (entry) => (entry.source ? <SourceAlert source={entry.source} /> : null),
  copy: {
    plural: "Entrate",
    loadingLabel: "Caricamento delle entrate",
    newLabel: "Nuova entrata",
    createTitle: "Nuova entrata",
    createDescription: "Registra un'entrata: entra subito nel bilancio, nella sua categoria.",
    createSubmit: "Registra l'entrata",
    editTitle: "Modifica l'entrata",
    editDescription: "Il bilancio si aggiorna da solo.",
    createdToast: "Entrata registrata",
    updatedToast: "Entrata aggiornata",
    deletedToast: "Entrata eliminata",
    emptyTitle: "Nessuna entrata in questo periodo",
    emptyDescription: "Cambia periodo, oppure registra un'entrata: finisce da sola nel bilancio.",
    deleteDescription: "L'entrata esce dal bilancio. L'azione non si può annullare.",
    countNoun: "Entrate",
    moreLabel: "Mostra altre entrate",
  },
  searchLabel: "Cerca un'entrata",
  filter: {
    label: "Filtra per origine",
    param: "origin",
    options: [
      { value: "", label: "Tutte" },
      { value: "MANUAL", label: "Registrate qui" },
      { value: "LINKED", label: "Dai pagamenti" },
    ],
  },
  fields: [
    { name: "description", label: "Nome dell'entrata", kind: "text", required: true, hint: "Per esempio: Contributo del Comune." },
    {
      name: "category",
      label: "Categoria",
      kind: "suggest",
      required: true,
      hint: "Scegli una categoria che esiste già o scrivine una nuova.",
      suggestions: { path: "/ledger/categories", query: { kind: "INCOME" } },
      half: true,
    },
    { name: "occurredOn", label: "Data", kind: "date", required: true, half: true },
    { name: "amount", label: "Importo in euro", kind: "money", required: true, hint: "Per esempio 60 o 60,50.", half: true },
    { name: "supplier", label: "Versata da", kind: "text", hint: "Chi ha pagato, se vuoi ricordarlo.", half: true },
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
      ...(mode === "create" ? { kind: "INCOME" } : {}),
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
    lines: [[entry.category, entry.supplier].filter(Boolean).join(" · "), formatDay(entry.occurredOn)],
    leading: <CategoryTile category={entry.category} />,
    status: entry.source ? <Badge variant="warning">{SOURCES[entry.source].label}</Badge> : <Badge variant="success">Registrata qui</Badge>,
    figure: <span className="ml-auto text-base font-extrabold text-success">+ {formatEuro(entry.amountCents)}</span>,
  }),
};
