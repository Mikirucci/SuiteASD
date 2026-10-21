import type { Prisma } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { fromDateOnly, toDateOnly, toDateOnlyOrNull } from '../../lib/date-only.js';
import { notFound } from '../../lib/errors.js';
import { syncLinkedExpense, today } from '../../lib/ledger-links.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import type { CreateKitBody, KitDto, KitGroupsDto, ListKitsQuery, UpdateKitBody } from './schema.js';

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
    costCents: kit.costCents,
    costDate: toDateOnlyOrNull(kit.costDate),
    createdAt: toIso(kit.createdAt),
    updatedAt: toIso(kit.updatedAt),
  };
}

export function kitName(kit: { item: string; size: string | null; number: number | null }): string {
  return [kit.item, kit.size, kit.number !== null ? `n. ${kit.number}` : null].filter(Boolean).join(' ');
}

// The cost of a kit is an expense of the balance, kept in step with it.
async function syncCost(ctx: TenantRequestContext, kit: KitRow): Promise<void> {
  await syncLinkedExpense({
    db: ctx.db,
    societyId: ctx.auth.societyId,
    userId: ctx.auth.userId,
    source: { kitId: kit.id },
    expense: kit.costCents
      ? { category: 'Divise', description: kitName(kit), amountCents: kit.costCents, occurredOn: kit.costDate ?? today() }
      : null,
  });
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
        ...(query.q
          ? {
              OR: [
                { item: { contains: query.q } },
                { size: { contains: query.q } },
                { member: { is: { OR: [{ firstName: { contains: query.q } }, { lastName: { contains: query.q } }] } } },
              ],
            }
          : {}),
        ...(query.item ? { item: query.item } : {}),
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
    const { costDate, ...rest } = body;
    const kit = await ctx.db.kit.create({
      data: {
        ...rest,
        societyId: ctx.auth.societyId,
        assignedAt: body.memberId ? new Date() : null,
        costDate: body.costCents ? fromDateOnly(costDate ?? toDateOnly(today())) : null,
      },
      include: withMember,
    });
    await syncCost(ctx, kit);
    return toDto(kit);
  },

  async update(ctx, id, body) {
    await assertMemberExists(ctx, body.memberId);
    const current = await ctx.db.kit.findFirst({ where: { id }, select: { memberId: true, costDate: true } });
    if (!current) throw notFound('Kit');
    // The assignment date moves only when the holder actually changes.
    const holderChanged = body.memberId !== undefined && body.memberId !== current.memberId;
    const { costDate, ...rest } = body;
    // A cost keeps the day it was booked unless a new one is given; removing the cost clears the day
    const bookedOn =
      body.costCents === null
        ? null
        : costDate !== undefined
          ? (costDate === null ? today() : fromDateOnly(costDate))
          : body.costCents && !current.costDate
            ? today()
            : undefined;
    const kit = await ctx.db.kit.update({
      where: { id },
      data: { ...rest, costDate: bookedOn, ...(holderChanged ? { assignedAt: body.memberId ? new Date() : null } : {}) },
      include: withMember,
    });
    await syncCost(ctx, kit);
    return toDto(kit);
  },

  async remove({ db }, id) {
    const result = await db.kit.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Kit');
  },
};

// One group per item name (every "Maglia gara", every "Tuta"...): how many pieces, how many are assigned or in stock,
// and what they cost. The Divise page shows a card for each group and the pieces inside it.
export async function listKitGroups({ db }: TenantRequestContext): Promise<KitGroupsDto> {
  const rows = await db.kit.findMany({ select: { item: true, memberId: true, costCents: true } });
  const groups = new Map<string, KitGroupsDto['data'][number]>();
  for (const row of rows) {
    const group = groups.get(row.item) ?? { item: row.item, total: 0, assigned: 0, inStock: 0, totalCostCents: 0 };
    group.total += 1;
    if (row.memberId) group.assigned += 1;
    else group.inStock += 1;
    group.totalCostCents += row.costCents ?? 0;
    groups.set(row.item, group);
  }
  return { data: [...groups.values()].sort((a, b) => a.item.localeCompare(b.item, 'it')) };
}
