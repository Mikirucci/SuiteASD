import { Handshake } from "lucide-react";
import { z } from "zod";
import { Badge, type BadgeVariant } from "@/components/ui";
import { formatDay, formatEuro } from "@/features/quote/format";
import type { ResourceConfig } from "../crud/types";
import {
  amountToInput,
  bodyReader,
  optionalDay,
  optionalEmail,
  optionalPhone,
  optionalText,
  parseAmount,
  requiredAmount,
  requiredText,
} from "../crud/values";
import { joinParts } from "../format";
import type { Sponsor, SponsorStatus } from "../types";

const STATUS_LABELS: Record<SponsorStatus, string> = { ACTIVE: "Attivo", PROSPECT: "Potenziale", EXPIRED: "Scaduto" };
const STATUS_VARIANTS: Record<SponsorStatus, BadgeVariant> = { ACTIVE: "success", PROSPECT: "brand", EXPIRED: "warning" };

const schema = z
  .object({
    name: requiredText(120, "Inserisci il nome dello sponsor"),
    contactName: optionalText(120),
    email: optionalEmail(),
    phone: optionalPhone(),
    amount: requiredAmount(),
    contractStart: optionalDay(),
    contractEnd: optionalDay(),
    status: z.enum(["ACTIVE", "PROSPECT", "EXPIRED"]),
    notes: optionalText(1000),
  })
  .refine((values) => values.contractStart === "" || values.contractEnd === "" || values.contractEnd >= values.contractStart, {
    message: "La fine del contratto non può essere prima dell'inizio",
    path: ["contractEnd"],
  });

function contractPeriod(sponsor: Sponsor): string | null {
  if (sponsor.contractStart && sponsor.contractEnd) return `Contratto dal ${formatDay(sponsor.contractStart)} al ${formatDay(sponsor.contractEnd)}`;
  if (sponsor.contractEnd) return `Contratto fino al ${formatDay(sponsor.contractEnd)}`;
  if (sponsor.contractStart) return `Contratto dal ${formatDay(sponsor.contractStart)}`;
  return null;
}

export const sponsorsConfig: ResourceConfig<Sponsor> = {
  key: "sponsors",
  path: "/sponsors",
  writePermission: "sponsors:write",
  icon: Handshake,
  fieldAliases: { amountCents: "amount" },
  searchLabel: "Cerca per nome dello sponsor",
  copy: {
    plural: "Sponsor",
    loadingLabel: "Caricamento degli sponsor",
    newLabel: "Nuovo sponsor",
    createTitle: "Nuovo sponsor",
    createDescription: "Importo e scadenza del contratto, con il referente da contattare.",
    createSubmit: "Crea lo sponsor",
    editTitle: "Modifica lo sponsor",
    editDescription: "Le modifiche valgono da subito per tutta la società.",
    createdToast: "Sponsor creato",
    updatedToast: "Sponsor aggiornato",
    deletedToast: "Sponsor eliminato",
    emptyTitle: "Nessuno sponsor",
    emptyDescription: "Aggiungi chi sostiene la società, con importo e scadenza del contratto.",
    deleteDescription: "Lo sponsor sparisce dall'elenco. L'azione non si può annullare.",
    countNoun: "Sponsor",
    moreLabel: "Mostra altri sponsor",
  },
  filter: {
    label: "Filtra per stato",
    param: "status",
    options: [
      { value: "", label: "Tutti" },
      { value: "ACTIVE", label: "Attivi" },
      { value: "PROSPECT", label: "Potenziali" },
      { value: "EXPIRED", label: "Scaduti" },
    ],
  },
  fields: [
    { name: "name", label: "Nome dello sponsor", kind: "text", required: true },
    { name: "contactName", label: "Referente", kind: "text" },
    { name: "email", label: "Email", kind: "email", half: true },
    { name: "phone", label: "Telefono", kind: "tel", half: true },
    {
      name: "amount",
      label: "Importo del contratto in euro",
      kind: "money",
      required: true,
      hint: "Scrivi 0 se non c'è ancora un importo.",
      half: true,
    },
    {
      name: "status",
      label: "Stato",
      kind: "select",
      options: (Object.keys(STATUS_LABELS) as SponsorStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] })),
      half: true,
    },
    { name: "contractStart", label: "Inizio del contratto", kind: "date", half: true },
    { name: "contractEnd", label: "Fine del contratto", kind: "date", half: true },
    { name: "notes", label: "Note", kind: "textarea" },
  ],
  schema,
  initialValues: (sponsor) => ({
    name: sponsor?.name ?? "",
    contactName: sponsor?.contactName ?? "",
    email: sponsor?.email ?? "",
    phone: sponsor?.phone ?? "",
    amount: amountToInput(sponsor?.amountCents ?? null),
    contractStart: sponsor?.contractStart ?? "",
    contractEnd: sponsor?.contractEnd ?? "",
    status: sponsor?.status ?? "ACTIVE",
    notes: sponsor?.notes ?? "",
  }),
  toBody: (values, mode) => {
    const read = bodyReader(values, mode);
    return {
      name: read.raw("name"),
      contactName: read.text("contactName"),
      email: read.text("email"),
      phone: read.text("phone"),
      // The API has no "empty" amount: the schema already guarantees a valid one.
      amountCents: parseAmount(read.raw("amount")) ?? 0,
      contractStart: read.text("contractStart"),
      contractEnd: read.text("contractEnd"),
      status: read.raw("status"),
      notes: read.text("notes"),
    };
  },
  nameOf: (sponsor) => sponsor.name,
  row: (sponsor) => ({
    title: sponsor.name,
    lines: [
      joinParts([formatEuro(sponsor.amountCents), contractPeriod(sponsor)], " · "),
      joinParts([sponsor.contactName, sponsor.email, sponsor.phone]),
      sponsor.notes,
    ],
    status: <Badge variant={STATUS_VARIANTS[sponsor.status]}>{STATUS_LABELS[sponsor.status]}</Badge>,
  }),
};
