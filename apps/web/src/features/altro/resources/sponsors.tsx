import { Handshake } from "lucide-react";
import { z } from "zod";
import { Avatar, Badge, type BadgeVariant } from "@/components/ui";
import { dayToDate, formatDay, formatEuro } from "@/lib/format";
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

/** The one date a card shows: when the contract ends. The start and the rest are in the detail. */
function contractEnd(sponsor: Sponsor): string {
  return sponsor.contractEnd ? `Fino al ${formatDay(sponsor.contractEnd)}` : "Senza scadenza";
}

/** An active contract that ends within this many days is shown as expiring (the same reach as the API summary). */
export const EXPIRING_WITHIN_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * What the card says about the end of an active contract: nothing while it is far away, a countdown in the last month,
 * "terminato" once the day has passed. Only an active sponsor can be expiring: the other states say it already.
 */
export function contractAlert(sponsor: Sponsor, today: Date): string | null {
  if (sponsor.status !== "ACTIVE" || !sponsor.contractEnd) return null;
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((dayToDate(sponsor.contractEnd).getTime() - midnight.getTime()) / DAY_MS);
  if (days < 0) return "Contratto terminato";
  if (days === 0) return "Scade oggi";
  if (days === 1) return "Scade domani";
  return days <= EXPIRING_WITHIN_DAYS ? `Scade tra ${days} giorni` : null;
}

export const sponsorsConfig: ResourceConfig<Sponsor> = {
  key: "sponsors",
  path: "/sponsors",
  writePermission: "sponsors:write",
  attachmentType: "SPONSOR",
  openOnClick: true,
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
    editDescription: "Cambia i dati del contratto e allega i documenti: le modifiche valgono da subito.",
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
      { value: "", label: "Tutti gli stati" },
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
      hint: "Finisce tra le entrate, nella categoria Sponsor, il giorno in cui inizia il contratto. Un potenziale non ha ancora entrate; scrivi 0 se non c'è un importo.",
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
  row: (sponsor) => {
    const alert = contractAlert(sponsor, new Date());
    return {
      title: sponsor.name,
      leading: <Avatar name={sponsor.name} decorative />,
      // Only what is needed to tell sponsors apart at a glance: the card opens to the rest
      lines: [sponsor.email, contractEnd(sponsor)],
      status: (
        <>
          <Badge variant={STATUS_VARIANTS[sponsor.status]}>{STATUS_LABELS[sponsor.status]}</Badge>
          {alert ? <Badge variant="warning">{alert}</Badge> : null}
        </>
      ),
      figure:
        sponsor.amountCents > 0 ? (
          <span className="ml-auto text-base font-extrabold text-fg">{formatEuro(sponsor.amountCents)}</span>
        ) : (
          <span className="ml-auto text-sm text-fg-muted">Importo da definire</span>
        ),
    };
  },
};
