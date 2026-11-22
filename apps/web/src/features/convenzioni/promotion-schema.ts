import { z } from "zod";
import { addDays, toDayKey } from "@/lib/dates";
import type { AudienceRole, CardTemplate, CreatePromotionBody, Promotion, UpdatePromotionBody } from "./types";

/** Limits mirror the promotion requests of the backend (docs/api/openapi.yaml) so most mistakes are caught before the request. */
const dayText = z.iso.date("Inserisci una data valida");

export const AUDIENCE_ROLE_OPTIONS: readonly { value: AudienceRole; label: string }[] = [
  { value: "ADMIN", label: "Amministratori" },
  { value: "SEGRETERIA", label: "Segreteria" },
  { value: "ALLENATORE", label: "Allenatori" },
  { value: "STAFF", label: "Staff" },
];

const TEMPLATES = ["ELETTRICO", "MENTA", "OCEANO", "ALBA", "NOTTE", "CARBONE"] as const satisfies readonly CardTemplate[];
const ROLES = ["ADMIN", "SEGRETERIA", "ALLENATORE", "STAFF"] as const satisfies readonly AudienceRole[];

export const promotionFormSchema = z
  .object({
    title: z.string().trim().min(1, "Inserisci il titolo della convenzione").max(120, "Massimo 120 caratteri"),
    partnerName: z.string().trim().min(1, "Inserisci il nome del partner").max(120, "Massimo 120 caratteri"),
    partnerLabel: z.string().trim().max(40, "Massimo 40 caratteri"),
    city: z.string().trim().max(80, "Massimo 80 caratteri"),
    badge: z.string().trim().max(24, "Massimo 24 caratteri"),
    terms: z.string().trim().max(1000, "Massimo 1000 caratteri"),
    template: z.enum(TEMPLATES),
    validFrom: dayText,
    validTo: dayText,
    allMembers: z.boolean(),
    teamIds: z.array(z.string()),
    roles: z.array(z.enum(ROLES)),
  })
  .refine((values) => values.validTo >= values.validFrom, {
    path: ["validTo"],
    message: "La fine non può precedere l'inizio",
  });

export type PromotionFormValues = z.infer<typeof promotionFormSchema>;

/** A new promotion starts valid from today for a year, with the first template and nobody chosen yet. */
export function emptyPromotionForm(today: Date = new Date()): PromotionFormValues {
  return {
    title: "",
    partnerName: "",
    partnerLabel: "",
    city: "",
    badge: "",
    terms: "",
    template: "ELETTRICO",
    validFrom: toDayKey(today),
    validTo: toDayKey(addDays(today, 365)),
    allMembers: false,
    teamIds: [],
    roles: [],
  };
}

export function formValuesOf(promotion: Promotion): PromotionFormValues {
  return {
    title: promotion.title,
    partnerName: promotion.partnerName,
    partnerLabel: promotion.partnerLabel ?? "",
    city: promotion.city ?? "",
    badge: promotion.badge ?? "",
    terms: promotion.terms ?? "",
    template: promotion.template,
    validFrom: promotion.validFrom,
    validTo: promotion.validTo,
    allMembers: promotion.allMembers,
    teamIds: promotion.teamIds,
    roles: promotion.roles,
  };
}

/** Optional texts that were left empty are not sent at all when creating. */
export function toCreateBody(values: PromotionFormValues): CreatePromotionBody {
  const body: CreatePromotionBody = {
    title: values.title,
    partnerName: values.partnerName,
    template: values.template,
    validFrom: values.validFrom,
    validTo: values.validTo,
    allMembers: values.allMembers,
    teamIds: values.teamIds,
    roles: values.roles,
  };
  if (values.partnerLabel) body.partnerLabel = values.partnerLabel;
  if (values.city) body.city = values.city;
  if (values.badge) body.badge = values.badge;
  if (values.terms) body.terms = values.terms;
  return body;
}

/** The whole form is sent; an optional text that was emptied is cleared with null. */
export function toUpdateBody(values: PromotionFormValues): UpdatePromotionBody {
  return {
    title: values.title,
    partnerName: values.partnerName,
    partnerLabel: values.partnerLabel === "" ? null : values.partnerLabel,
    city: values.city === "" ? null : values.city,
    badge: values.badge === "" ? null : values.badge,
    terms: values.terms === "" ? null : values.terms,
    template: values.template,
    validFrom: values.validFrom,
    validTo: values.validTo,
    allMembers: values.allMembers,
    teamIds: values.teamIds,
    roles: values.roles,
  };
}

/** Who a promotion is meant for, in words, for the cards and the confirmation. */
export function describeAudience(promotion: Pick<Promotion, "allMembers" | "teamIds" | "roles">, teamNames: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  if (promotion.allMembers) parts.push("Tutti i tesserati");
  if (promotion.teamIds.length === 1) parts.push(teamNames.get(promotion.teamIds[0] ?? "") ?? "Una squadra");
  if (promotion.teamIds.length > 1) parts.push(`${promotion.teamIds.length} squadre`);
  for (const role of AUDIENCE_ROLE_OPTIONS) if (promotion.roles.includes(role.value)) parts.push(role.label);
  return parts.length > 0 ? parts.join(" · ") : "Nessun destinatario";
}
