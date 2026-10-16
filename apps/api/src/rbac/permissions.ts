import type { Role } from '../shared/enums.js';

// The ONLY place where "who can do what" is defined (SPEC section 2).
// Routes reference permissions by name (`app.requirePermission('teams:write')`); never hardcode roles in routes.
//
// Naming: `<resource>:<action>`.
//  - `read` / `write`  : access to the society-wide data.
//  - `readOwn`         : the user's own data (athlete) or their linked children's (guardian);
//                        the service must additionally restrict rows to what the user owns.

const A = 'ADMIN';
const S = 'SEGRETERIA';
const C = 'ALLENATORE';
const D = 'STAFF';
const T = 'ATLETA';
const G = 'GENITORE';

const ALL: readonly Role[] = [A, S, C, D, T, G];

export const PERMISSIONS = {
  'society:read': ALL,
  'society:write': [A],

  'users:read': [A, S],
  'invitations:read': [A, S],
  'invitations:write': [A, S],
  'joinLinks:read': [A, S],
  'joinLinks:write': [A, S],
  'guardianLinks:read': [A, S],
  'guardianLinks:write': [A, S],

  'members:read': [A, S, C, D],
  'members:readOwn': ALL,
  'members:write': [A, S],

  'teams:read': ALL,
  'teams:write': [A, S],

  'documents:read': [A, S, C, D],
  'documents:readOwn': ALL,
  'documents:write': [A, S],

  'payments:read': [A, S],
  'payments:readOwn': ALL,
  'payments:write': [A, S],
  'receipts:read': [A, S],

  'events:read': ALL,
  'events:write': [A, S, C],
  'convocations:read': [A, S, C, D],
  'convocations:readOwn': ALL,
  'convocations:write': [A, C],
  'convocations:respond': [T, G],
  'convocations:override': [A],
  'attendance:read': [A, S, C],
  'attendance:write': [A, C],

  'competitions:read': ALL,
  'competitions:write': [A, S, C],
  'evaluations:read': [A, C],
  'evaluations:readOwn': [T, G],
  'evaluations:write': [A, C],

  'notifications:readOwn': ALL,
  'devices:write': ALL,
  'automations:read': [A, S],
  'automations:write': [A],
  'statistics:read': [A, S],

  'venues:read': ALL,
  'venues:write': [A, S, D],
  'trips:read': ALL,
  'trips:write': [A, D],
  'kits:read': [A, S, C, D],
  'kits:write': [A, D],
  'sponsors:read': [A],
  'sponsors:write': [A],
  'ledger:read': [A],
  'ledger:write': [A],
  'announcements:read': ALL,
  'announcements:write': [A, S, C],
  'referees:read': [A, S, D],
  'referees:write': [A, D],
  'attachments:use': [A, S, D],
  'staff:read': [A, S, D],
  'staff:write': [A],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

// Which roles a given role may grant through an invitation (no privilege escalation).
export const INVITABLE_ROLES: Record<Role, readonly Role[]> = {
  ADMIN: ALL,
  SEGRETERIA: [C, D, T, G],
  ALLENATORE: [],
  STAFF: [],
  ATLETA: [],
  GENITORE: [],
};

export function can(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}

export function permissionsFor(roles: readonly Role[]): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((permission) => can(roles, permission));
}

export function canInviteRole(inviterRoles: readonly Role[], target: Role): boolean {
  return inviterRoles.some((role) => INVITABLE_ROLES[role].includes(target));
}
