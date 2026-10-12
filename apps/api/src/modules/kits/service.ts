import type { Prisma } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { notFound } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import type { CreateKitBody, KitDto, ListKitsQuery, UpdateKitBody } from './schema.js';

const withMember = {
  member: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.KitInclude;

type KitRow = Prisma.KitGetPayload<{ include: typeof withMember }>;

function toDto(kit: KitRow): KitDto {
  return {
    id: kit.id,
    item: kit.item,
    size: kit.size,
    number: kit.number,
    condition: kit.condition,
    memberId: kit.memberId,
    member: kit.member,
    assignedAt: toIsoOrNull(kit.assignedAt),
    notes: kit.notes,
    createdAt: toIso(kit.createdAt),
    updatedAt: toIso(kit.updatedAt),
  };
}

// Ids received from the client must be checked through the scoped client: a foreign-tenant id looks "not found".
async function assertMemberExists({ db }: TenantRequestContext, memberId: string | null | undefined): Promise<void> {
  if (!memberId) return;
  if (!(await db.member.findFirst({ where: { id: memberId }, select: { id: true } }))) throw notFound('Member');
}

export const kitService: CrudService<KitDto, CreateKitBody, UpdateKitBody, ListKitsQuery> = {
  async list({ db }, query) {
    const rows = await db.kit.findMany({
      where: {
        ...(query.q ? { item: { contains: query.q } } : {}),
        ...(query.size ? { size: query.size } : {}),
        ...(query.memberId ? { memberId: query.memberId } : {}),
        ...(query.assigned === undefined ? {} : { memberId: query.assigned ? { not: null } : null }),
      },
      include: withMember,
      orderBy: [{ item: 'asc' }, { size: 'asc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toDto), page: page.page };
  },

  async get({ db }, id) {
    const kit = await db.kit.findFirst({ where: { id }, include: withMember });
    if (!kit) throw notFound('Kit');
    return toDto(kit);
  },

  async create(ctx, body) {
    await assertMemberExists(ctx, body.memberId);
    const kit = await ctx.db.kit.create({
      data: { ...body, societyId: ctx.auth.societyId, assignedAt: body.memberId ? new Date() : null },
      include: withMember,
    });
    return toDto(kit);
  },

  async update(ctx, id, body) {
    await assertMemberExists(ctx, body.memberId);
    const current = await ctx.db.kit.findFirst({ where: { id }, select: { memberId: true } });
    if (!current) throw notFound('Kit');
    // The assignment date moves only when the holder actually changes.
    const holderChanged = body.memberId !== undefined && body.memberId !== current.memberId;
    const kit = await ctx.db.kit.update({
      where: { id },
      data: { ...body, ...(holderChanged ? { assignedAt: body.memberId ? new Date() : null } : {}) },
      include: withMember,
    });
    return toDto(kit);
  },

  async remove({ db }, id) {
    const result = await db.kit.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Kit');
  },
};
