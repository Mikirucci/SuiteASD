import { pluralize } from "@/lib/format";
import type { DocumentIndicator, DocumentStatus, MemberListItem } from "./types";

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

/** "2026-11-27" as a local calendar day (no timezone shift). */
export function parseDateOnly(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateOnly(value: string): string {
  return dateFormat.format(parseDateOnly(value));
}

export function fullNameOf(member: Pick<MemberListItem, "firstName" | "lastName">): string {
  return `${member.firstName} ${member.lastName}`;
}

/** "Scade tra 15 giorni", "Scaduto da 3 giorni": the wording of the expiry card in the video. */
export function describeExpiry(daysRemaining: number): string {
  if (daysRemaining === 0) return "Scade oggi";
  if (daysRemaining === 1) return "Scade domani";
  if (daysRemaining > 1) return `Scade tra ${daysRemaining} giorni`;
  if (daysRemaining === -1) return "Scaduto ieri";
  return `Scaduto da ${-daysRemaining} giorni`;
}

/** How loudly an expiry reads: red up to a week (or already expired), amber up to a month, plain otherwise. */
export type ExpiryTone = "danger" | "warning" | "neutral";

const DANGER_WITHIN_DAYS = 7;
const WARNING_WITHIN_DAYS = 30;

export function expiryTone(daysRemaining: number | null): ExpiryTone {
  if (daysRemaining === null) return "neutral";
  if (daysRemaining <= DANGER_WITHIN_DAYS) return "danger";
  if (daysRemaining <= WARNING_WITHIN_DAYS) return "warning";
  return "neutral";
}

/** Title of a document row: the type, plus the free title unless it only says the same ("Certificato medico · Certificato medico"). */
export function documentHeading(typeName: string, title: string | null): string {
  const free = title?.trim();
  if (!free) return typeName;
  return free.toLowerCase().includes(typeName.toLowerCase()) ? free : `${typeName} · ${free}`;
}

/** "Scade il 18 ottobre 2026 · scade domani", "Scaduto il 10 ottobre 2026 · da 7 giorni". */
export function describeExpiryLine(expiresAt: string, daysRemaining: number | null): string {
  const date = formatDateOnly(expiresAt);
  if (daysRemaining === null) return `Scade il ${date}`;
  if (daysRemaining >= 0) {
    const how = describeExpiry(daysRemaining);
    return `Scade il ${date} · ${how.charAt(0).toLowerCase()}${how.slice(1)}`;
  }
  return `Scaduto il ${date} · ${daysRemaining === -1 ? "ieri" : `da ${-daysRemaining} giorni`}`;
}

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  OK: "In regola",
  EXPIRING: "In scadenza",
  EXPIRED: "Scaduto",
  MISSING: "Mancante",
};

const ROLE_LABEL: Record<string, string> = {
  PADRE: "Padre",
  MADRE: "Madre",
  TUTORE: "Tutore",
  ALTRO: "Altro familiare",
};

export function guardianRelationLabel(relation: string): string {
  return ROLE_LABEL[relation] ?? "Familiare";
}

/**
 * How a team is shown in selects, filters, chips and sentences: always its name, with the
 * category appended ("Rosa Under 16 (U16)") only when the name does not already contain it.
 */
export function teamLabel(team: { name: string; category: string | null }): string {
  const category = team.category?.trim();
  if (!category || team.name.toLowerCase().includes(category.toLowerCase())) return team.name;
  return `${team.name} (${category})`;
}

export interface DocumentSummary {
  /** Names of the required documents that are missing or expired. */
  missing: string[];
  /** Names of the required documents that expire soon. */
  expiring: string[];
}

export function summarizeDocuments(indicators: readonly DocumentIndicator[]): DocumentSummary {
  return {
    missing: indicators.filter((indicator) => indicator.status === "MISSING" || indicator.status === "EXPIRED").map((indicator) => indicator.name),
    expiring: indicators.filter((indicator) => indicator.status === "EXPIRING").map((indicator) => indicator.name),
  };
}

/** "2 documenti mancanti", "1 documento mancante". */
export function missingLabel(count: number): string {
  return pluralize(count, "documento mancante", "documenti mancanti");
}

/** "1 in scadenza", "3 in scadenza". */
export function expiringLabel(count: number): string {
  return `${count} in scadenza`;
}
