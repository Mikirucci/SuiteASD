import { Shirt } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui";
import { formatDay, formatEuro } from "@/lib/format";
import type { ResourceConfig } from "../crud/types";
import { amountToInput, bodyReader, numberToInput, optionalDay, optionalInteger, optionalPositiveAmount, optionalText, requiredText } from "../crud/values";
import { joinParts } from "../format";
import type { Kit } from "../types";

const schema = z.object({
  item: requiredText(80, "Inserisci cosa è, per esempio Maglia gara"),
  size: optionalText(20),
  number: optionalInteger(0, 99),
  condition: optionalText(80),
  memberId: z.string(),
  memberLabel: z.string(),
  notes: optionalText(500),
  cost: optionalPositiveAmount(),
  costDate: optionalDay(),
});

export function kitName(kit: Pick<Kit, "item" | "size" | "number">): string {
  return joinParts([kit.item, kit.size, kit.number !== null ? `n. ${kit.number}` : null]);
}

export const kitsConfig: ResourceConfig<Kit> = {
  key: "kits",
  path: "/kits",
  writePermission: "kits:write",
  attachmentType: "KIT",
  icon: Shirt,
  fieldAliases: { costCents: "cost" },
  searchLabel: "Cerca per capo, taglia o assegnatario",
  copy: {
    plural: "Divise",
    loadingLabel: "Caricamento delle divise",
    newLabel: "Nuovo capo",
    createTitle: "Nuovo capo",
    createDescription: "Registra il capo con taglia e numero. Puoi assegnarlo subito a un tesserato.",
    createSubmit: "Aggiungi il capo",
    editTitle: "Modifica il capo",
    editDescription: "Cambia l'assegnazione per consegnarlo a qualcuno o riportarlo in magazzino.",
    createdToast: "Capo aggiunto",
    updatedToast: "Capo aggiornato",
    deletedToast: "Capo eliminato",
    emptyTitle: "Nessun capo in magazzino",
    emptyDescription: "Aggiungi maglie, pantaloncini e tute con taglia e numero, poi assegnali ai tesserati.",
    deleteDescription: "Il capo sparisce dal magazzino. L'azione non si può annullare.",
    countNoun: "Capi",
    moreLabel: "Mostra altri capi",
  },
  filter: {
    label: "Filtra per assegnazione",
    param: "assigned",
    options: [
      { value: "", label: "Tutte le assegnazioni" },
      { value: "false", label: "In magazzino" },
      { value: "true", label: "Assegnati" },
    ],
  },
  fields: [
    { name: "item", label: "Capo", kind: "text", required: true, hint: "Per esempio: Maglia gara, Tuta, Pantaloncini." },
    { name: "size", label: "Taglia", kind: "text", half: true },
    { name: "number", label: "Numero di maglia", kind: "integer", hint: "Da 0 a 99.", half: true },
    { name: "condition", label: "Condizione", kind: "text", hint: "Per esempio: nuovo, usato." },
    { name: "memberId", label: "Assegnato a", kind: "member", labelName: "memberLabel", hint: "Scegli “Nessuno” per tenerlo in magazzino." },
    { name: "cost", label: "Costo in euro", kind: "money", hint: "Facoltativo: finisce tra le uscite del bilancio.", half: true },
    { name: "costDate", label: "Data del costo", kind: "date", hint: "Se la lasci vuota vale oggi.", half: true },
    { name: "notes", label: "Note", kind: "textarea" },
  ],
  schema,
  initialValues: (kit) => ({
    item: kit?.item ?? "",
    size: kit?.size ?? "",
    number: numberToInput(kit?.number ?? null),
    condition: kit?.condition ?? "",
    memberId: kit?.memberId ?? "",
    memberLabel: kit?.member ? `${kit.member.firstName} ${kit.member.lastName}` : "",
    notes: kit?.notes ?? "",
    cost: amountToInput(kit?.costCents ?? null),
    costDate: kit?.costDate ?? "",
  }),
  toBody: (values, mode) => {
    const read = bodyReader(values, mode);
    return {
      item: read.raw("item"),
      size: read.text("size"),
      number: read.integer("number"),
      condition: read.text("condition"),
      memberId: read.text("memberId"),
      notes: read.text("notes"),
      costCents: read.amount("cost"),
      costDate: read.day("costDate"),
    };
  },
  nameOf: kitName,
  row: (kit) => ({
    title: kitName(kit),
    lines: [
      kit.member
        ? `Assegnato a ${kit.member.firstName} ${kit.member.lastName}${kit.assignedAt ? ` dal ${formatDay(kit.assignedAt.slice(0, 10))}` : ""}`
        : "In magazzino",
      kit.condition ? `Condizione: ${kit.condition}` : null,
      kit.costCents !== null ? `Costo: ${formatEuro(kit.costCents)}${kit.costDate ? ` del ${formatDay(kit.costDate)}` : ""}` : null,
      kit.notes,
    ],
    status: <Badge variant={kit.member ? "brand" : "neutral"}>{kit.member ? "Assegnato" : "In magazzino"}</Badge>,
  }),
};
