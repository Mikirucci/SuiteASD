import type { Role } from "@/lib/api";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Amministratore",
  SEGRETERIA: "Segreteria",
  ALLENATORE: "Allenatore",
  STAFF: "Staff",
  ATLETA: "Atleta",
  GENITORE: "Genitore",
};

export function describeRoles(roles: readonly Role[]): string {
  return roles.map((role) => ROLE_LABELS[role]).join(", ");
}
