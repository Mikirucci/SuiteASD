import type { TenantDb } from '../../lib/tenant.js';
import type { Role } from '../../shared/enums.js';

// Recipients are resolved by role (SPEC 07): the athlete's own account + the linked guardians + the staff.
// Everything returns de-duplicated user ids; members without an account simply have nobody to notify.

export type Audience =
  // Specific tesserati: each one's account and their guardians' accounts.
  | { kind: 'MEMBERS'; memberIds: readonly string[] }
  // The active athletes of a team (with their guardians) and, optionally, the team's staff accounts.
  | { kind: 'TEAM'; teamId: string; includeStaff?: boolean }
  // Every account of the society holding one of the roles (all accounts when `roles` is omitted).
  | { kind: 'ROLES'; roles?: readonly Role[] };

export type RecipientsDb = Pick<TenantDb, 'member' | 'membership' | 'teamStaff'>;

const memberAccounts = {
  userId: true,
  guardianLinks: { select: { guardianUserId: true } },
} as const;

function accountsOf(members: readonly { userId: string | null; guardianLinks: readonly { guardianUserId: string }[] }[]): string[] {
  return members.flatMap((member) => [
    ...(member.userId ? [member.userId] : []),
    ...member.guardianLinks.map((link) => link.guardianUserId),
  ]);
}

export async function resolveRecipients(db: RecipientsDb, audience: Audience): Promise<string[]> {
  switch (audience.kind) {
    case 'MEMBERS': {
      if (audience.memberIds.length === 0) return [];
      const members = await db.member.findMany({
        where: { id: { in: [...audience.memberIds] } },
        select: memberAccounts,
      });
      return [...new Set(accountsOf(members))];
    }
    case 'TEAM': {
      const members = await db.member.findMany({
        where: { status: 'ACTIVE', teamMemberships: { some: { teamId: audience.teamId, leftAt: null } } },
        select: memberAccounts,
      });
      const staff = audience.includeStaff
        ? await db.teamStaff.findMany({
            where: { teamId: audience.teamId, staffMember: { userId: { not: null } } },
            select: { staffMember: { select: { userId: true } } },
          })
        : [];
      const staffAccounts = staff.flatMap((row) => (row.staffMember.userId ? [row.staffMember.userId] : []));
      return [...new Set([...accountsOf(members), ...staffAccounts])];
    }
    case 'ROLES': {
      const rows = await db.membership.findMany({
        where: audience.roles ? { role: { in: [...audience.roles] } } : {},
        select: { userId: true },
      });
      return [...new Set(rows.map((row) => row.userId))];
    }
  }
}
