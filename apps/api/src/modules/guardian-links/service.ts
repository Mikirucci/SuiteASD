import type { GuardianLink } from '@prisma/client';
import { notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { guardianRelationSchema } from '../../shared/enums.js';
import type { CreateGuardianLinkBody, GuardianLinkDto, ListGuardianLinksQuery } from './schema.js';

function toDto(link: GuardianLink): GuardianLinkDto {
  return {
    id: link.id,
    guardianUserId: link.guardianUserId,
    memberId: link.memberId,
    relation: guardianRelationSchema.parse(link.relation),
    createdAt: toIso(link.createdAt),
  };
}

export async function createGuardianLink(
  { db, auth }: TenantRequestContext,
  body: CreateGuardianLinkBody,
): Promise<GuardianLinkDto> {
  const member = await db.member.findFirst({ where: { id: body.memberId }, select: { id: true } });
  if (!member) throw notFound('Member');
  const guardianRole = await db.membership.findFirst({
    where: { userId: body.guardianUserId, role: 'GENITORE' },
    select: { id: true },
  });
  if (!guardianRole) {
    throw unprocessable('not_a_guardian', 'The user does not have the GENITORE role in this society');
  }
  const link = await db.guardianLink.create({
    data: {
      societyId: auth.societyId,
      guardianUserId: body.guardianUserId,
      memberId: body.memberId,
      relation: body.relation,
    },
  });
  return toDto(link);
}

export async function listGuardianLinks(
  { db }: TenantRequestContext,
  filters: ListGuardianLinksQuery,
  query: PaginationQuery,
): Promise<Page<GuardianLinkDto>> {
  const rows = await db.guardianLink.findMany({
    where: {
      ...(filters.memberId ? { memberId: filters.memberId } : {}),
      ...(filters.guardianUserId ? { guardianUserId: filters.guardianUserId } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toDto), page: page.page };
}

export async function deleteGuardianLink({ db }: TenantRequestContext, id: string): Promise<void> {
  const result = await db.guardianLink.deleteMany({ where: { id } });
  if (result.count === 0) throw notFound('Guardian link');
}
