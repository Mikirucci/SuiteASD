import type { Role } from "@/lib/api";

/** Wire types of the invitations endpoints. Source of truth: apps/api/src/modules/invitations/schema.ts. */
export interface Invitation {
  id: string;
  email: string;
  role: Role;
  memberId: string | null;
  expiresAt: string;
  createdAt: string;
}

/** The raw token comes back once, in the response that creates the invitation. */
export interface CreatedInvitation extends Invitation {
  token: string;
}

export interface CreateInvitationBody {
  email: string;
  role: Role;
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Amministratore",
  SEGRETERIA: "Segreteria",
  ALLENATORE: "Allenatore",
  STAFF: "Staff",
  ATLETA: "Atleta",
  GENITORE: "Genitore",
};

/**
 * The roles of the administration. Athletes and parents are not invited here: they join with an enrolment link,
 * which also creates their member record (an invitation without a member would leave them with an empty area).
 */
export const COLLABORATOR_ROLES = ["ADMIN", "SEGRETERIA", "ALLENATORE", "STAFF"] as const;
export type CollaboratorRole = (typeof COLLABORATOR_ROLES)[number];

export const ROLE_HINT: Record<CollaboratorRole, string> = {
  ADMIN: "Può fare tutto, compresi bilancio, sponsor e automazioni.",
  SEGRETERIA: "Gestisce tesserati, quote, documenti e inviti.",
  ALLENATORE: "Vede i tesserati, convoca, segna le presenze e scrive le pagelle.",
  STAFF: "Vede tesserati e documenti; gestisce palestre, trasferte e divise.",
};

/** Mirrors INVITABLE_ROLES of the API (nobody grants more than they have): the server enforces it, this only hides what would be refused. */
const INVITABLE_BY: Partial<Record<Role, readonly CollaboratorRole[]>> = {
  ADMIN: COLLABORATOR_ROLES,
  SEGRETERIA: ["ALLENATORE", "STAFF"],
};

export function invitableRoles(roles: readonly Role[]): CollaboratorRole[] {
  return COLLABORATOR_ROLES.filter((target) => roles.some((role) => INVITABLE_BY[role]?.includes(target)));
}

/** The page where the invited person sets a password and joins. */
export function invitationLink(origin: string, token: string): string {
  return `${origin}/invito/${encodeURIComponent(token)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "Scade oggi", "Scade domani", "Scade tra 5 giorni": counted in calendar days of the viewer. */
export function describeInvitationExpiry(expiresAt: string, now: Date): string {
  // Rounding absorbs the 23 and 25 hour days of the clock changes
  const days = Math.round((startOfDay(new Date(expiresAt)) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return "Scade oggi";
  if (days === 1) return "Scade domani";
  return `Scade tra ${days} giorni`;
}
