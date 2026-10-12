import type { LedgerEntry, Prisma } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { fromDateOnly, toDateOnly } from '../../lib/date-only.js';
import { notFound } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { ledgerKindSchema } from '../../shared/enums.js';
import { buildLedgerReport } from './report.js';
import type {
  CreateLedgerEntryBody,
  LedgerEntryDto,
  LedgerReportDto,
  LedgerReportQuery,
  ListLedgerEntriesQuery,
  UpdateLedgerEntryBody,
} from './schema.js';

function toDto(entry: LedgerEntry): LedgerEntryDto {
  return {
    id: entry.id,
    kind: ledgerKindSchema.parse(entry.kind),
    category: entry.category,
    description: entry.description,
    amountCents: entry.amountCents,
    occurredOn: toDateOnly(entry.occurredOn),
    sponsorId: entry.sponsorId,
    paymentId: entry.paymentId,
    createdAt: toIso(entry.createdAt),
    updatedAt: toIso(entry.updatedAt),
  };
}

// Ids received from the client must be checked through the scoped client: a foreign-tenant id looks "not found".
async function assertSponsorExists({ db }: TenantRequestContext, sponsorId: string | null | undefined): Promise<void> {
  if (!sponsorId) return;
  if (!(await db.sponsor.findFirst({ where: { id: sponsorId }, select: { id: true } }))) throw notFound('Sponsor');
}

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
        societyId: ctx.auth.societyId,
        occurredOn: fromDateOnly(body.occurredOn),
        createdById: ctx.auth.userId,
      },
    });
    return toDto(entry);
  },

  async update(ctx, id, body) {
    await assertSponsorExists(ctx, body.sponsorId);
    const { occurredOn, ...rest } = body;
    const entry = await ctx.db.ledgerEntry.update({
      where: { id },
      data: { ...rest, ...(occurredOn ? { occurredOn: fromDateOnly(occurredOn) } : {}) },
    });
    return toDto(entry);
  },

  async remove({ db }, id) {
    const result = await db.ledgerEntry.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Ledger entry');
  },
};

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
