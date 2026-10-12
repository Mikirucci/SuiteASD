import type { Prisma } from '@prisma/client';
import { can, type Permission } from '../../rbac/permissions.js';
import type { TenantRequestContext } from '../../plugins/auth.js';

// ABAC for athletes and guardians (docs/API.md, "RBAC"): who holds the society-wide `read` permission sees every
// member; everybody else only their own member record (athlete) or their linked children (guardian).
export function ownMemberFilter({ auth }: Pick<TenantRequestContext, 'auth'>): Prisma.MemberWhereInput {
  return { OR: [{ userId: auth.userId }, { guardianLinks: { some: { guardianUserId: auth.userId } } }] };
}

export function memberScope(ctx: Pick<TenantRequestContext, 'auth'>, readPermission: Permission): Prisma.MemberWhereInput {
  return can(ctx.auth.roles, readPermission) ? {} : ownMemberFilter(ctx);
}

export async function ownMemberIds(ctx: TenantRequestContext): Promise<Set<string>> {
  const rows = await ctx.db.member.findMany({ where: ownMemberFilter(ctx), select: { id: true } });
  return new Set(rows.map((row) => row.id));
}
