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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Badge text of a team: the category (U16, Serie D) when set, else the name. */
export function teamLabel(team: { name: string; category: string | null }): string {
  return team.category ?? team.name;
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
