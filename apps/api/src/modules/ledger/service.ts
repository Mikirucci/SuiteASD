import type { LedgerEntry, Prisma } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { fromDateOnly, toDateOnly } from '../../lib/date-only.js';
import { conflict, notFound } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { ledgerKindSchema } from '../../shared/enums.js';
import { canonicalCategory, listCategories } from './categories.js';
import { buildLedgerReport } from './report.js';
import type {
  CreateLedgerEntryBody,
  LedgerCategoriesDto,
  LedgerEntryDto,
  LedgerReportDto,
  LedgerReportQuery,
  ListLedgerCategoriesQuery,
  ListLedgerEntriesQuery,
  UpdateLedgerEntryBody,
} from './schema.js';

function sourceOf(entry: LedgerEntry): LedgerEntryDto['source'] {
  if (entry.paymentId) return 'PAYMENT';
  if (entry.venueId) return 'VENUE';
  if (entry.kitId) return 'KIT';
  if (entry.tripId) return 'TRIP';
  if (entry.refereeAssignmentId) return 'REFEREE';
  return null;
}

function toDto(entry: LedgerEntry): LedgerEntryDto {
  return {
    id: entry.id,
    kind: ledgerKindSchema.parse(entry.kind),
    category: entry.category,
    description: entry.description,
    amountCents: entry.amountCents,
    occurredOn: toDateOnly(entry.occurredOn),
    sponsorId: entry.sponsorId,
    supplier: entry.supplier,
    notes: entry.notes,
    paymentId: entry.paymentId,
    source: sourceOf(entry),
    createdAt: toIso(entry.createdAt),
    updatedAt: toIso(entry.updatedAt),
  };
}

// Ids received from the client must be checked through the scoped client: a foreign-tenant id looks "not found".
async function assertSponsorExists({ db }: TenantRequestContext, sponsorId: string | null | undefined): Promise<void> {
  if (!sponsorId) return;
  if (!(await db.sponsor.findFirst({ where: { id: sponsorId }, select: { id: true } }))) throw notFound('Sponsor');
}

// Entries born from a payment or from the cost of a venue, kit, trip or referee follow their source: changing them here would
// put the balance out of step with it.
async function assertOwnEntry({ db }: TenantRequestContext, id: string): Promise<LedgerEntry> {
  const entry = await db.ledgerEntry.findFirst({ where: { id } });
  if (!entry) throw notFound('Ledger entry');
  if (sourceOf(entry)) throw conflict('ledger_entry_linked', 'The entry follows its source: change it there');
  return entry;
}

// An entry has a source when another module owns it (see sourceOf)
const LINKED_FILTER: Prisma.LedgerEntryWhereInput[] = [
  { paymentId: { not: null } },
  { venueId: { not: null } },
  { kitId: { not: null } },
  { tripId: { not: null } },
  { refereeAssignmentId: { not: null } },
];

export const ledgerService: CrudService<
  LedgerEntryDto,
  CreateLedgerEntryBody,
  UpdateLedgerEntryBody,
  ListLedgerEntriesQuery
> = {
  async list({ db }, query) {
    const occurredOn: Prisma.DateTimeFilter = {
      ...(query.from ? { gte: fromDateOnly(query.from) } : {}),
      ...(query.to ? { lte: fromDateOnly(query.to) } : {}),
    };
    const rows = await db.ledgerEntry.findMany({
      where: {
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.sponsorId ? { sponsorId: query.sponsorId } : {}),
        ...(Object.keys(occurredOn).length > 0 ? { occurredOn } : {}),
        ...(query.q
          ? { OR: [{ description: { contains: query.q } }, { supplier: { contains: query.q } }, { category: { contains: query.q } }] }
          : {}),
        ...(query.origin ? { AND: [query.origin === 'LINKED' ? { OR: LINKED_FILTER } : { NOT: { OR: LINKED_FILTER } }] } : {}),
      },
      orderBy: [{ occurredOn: 'desc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toDto), page: page.page };
  },

  async get({ db }, id) {
    const entry = await db.ledgerEntry.findFirst({ where: { id } });
    if (!entry) throw notFound('Ledger entry');
    return toDto(entry);
  },

  async create(ctx, body) {
    await assertSponsorExists(ctx, body.sponsorId);
    const entry = await ctx.db.ledgerEntry.create({
      data: {
        ...body,
        category: await canonicalCategory(ctx.db, body.kind, body.category),
        societyId: ctx.auth.societyId,
        occurredOn: fromDateOnly(body.occurredOn),
        createdById: ctx.auth.userId,
      },
    });
    return toDto(entry);
  },

  async update(ctx, id, body) {
    const current = await assertOwnEntry(ctx, id);
    await assertSponsorExists(ctx, body.sponsorId);
    const { occurredOn, category, ...rest } = body;
    // A new category (or a new kind with the same category) is matched with the ones already in use
    const kind = body.kind ?? ledgerKindSchema.parse(current.kind);
    const entry = await ctx.db.ledgerEntry.update({
      where: { id },
      data: {
        ...rest,
        ...(category !== undefined || body.kind !== undefined
          ? { category: await canonicalCategory(ctx.db, kind, category ?? current.category) }
          : {}),
        ...(occurredOn ? { occurredOn: fromDateOnly(occurredOn) } : {}),
      },
    });
    return toDto(entry);
  },

  async remove(ctx, id) {
    await assertOwnEntry(ctx, id);
    const { db } = ctx;
    const result = await db.ledgerEntry.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Ledger entry');
  },
};

export async function getLedgerCategories({ db }: TenantRequestContext, query: ListLedgerCategoriesQuery): Promise<LedgerCategoriesDto> {
  return { data: await listCategories(db, query.kind) };
}

export async function getLedgerReport({ db }: TenantRequestContext, query: LedgerReportQuery): Promise<LedgerReportDto> {
  const year = query.year ?? new Date().getUTCFullYear();
  const rows = await db.ledgerEntry.findMany({
    where: { occurredOn: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    select: { kind: true, category: true, amountCents: true, occurredOn: true },
  });
  return buildLedgerReport(
    year,
    rows.map((row) => ({ ...row, kind: ledgerKindSchema.parse(row.kind) })),
  );
}
