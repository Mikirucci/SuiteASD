import type { Role } from "@/lib/api";

/** Roles that work in the administration (everything except being an athlete or a guardian). */
const ADMINISTRATION_ROLES: readonly Role[] = ["ADMIN", "SEGRETERIA", "ALLENATORE", "STAFF"];
/** Roles that have a personal area: the people a society looks after and their parents. */
const PERSONAL_ROLES: readonly Role[] = ["ATLETA", "GENITORE"];

export function hasAdministration(roles: readonly Role[]): boolean {
  return roles.some((role) => ADMINISTRATION_ROLES.includes(role));
}

export function hasPersonalArea(roles: readonly Role[]): boolean {
  return roles.some((role) => PERSONAL_ROLES.includes(role));
}
