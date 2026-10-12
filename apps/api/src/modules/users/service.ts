import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { roleSchema } from '../../shared/enums.js';
import type { ListUsersQuery, UserListItem } from './schema.js';

// Accounts that belong to the current society (the tenant client hides every other user).
export async function listUsers(
  { db, auth }: TenantRequestContext,
  filters: ListUsersQuery,
  query: PaginationQuery,
): Promise<Page<UserListItem>> {
  const rows = await db.user.findMany({
    where: {
      ...(filters.role ? { memberships: { some: { societyId: auth.societyId, role: filters.role } } } : {}),
      ...(filters.q
        ? {
            OR: [
              { firstName: { contains: filters.q } },
              { lastName: { contains: filters.q } },
              { email: { contains: filters.q.toLowerCase() } },
            ],
          }
        : {}),
    },
    include: { memberships: { where: { societyId: auth.societyId } } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return {
    data: page.data.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      isActive: user.isActive,
      roles: user.memberships.map((membership) => roleSchema.parse(membership.role)),
    })),
    page: page.page,
  };
}
