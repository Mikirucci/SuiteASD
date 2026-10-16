import { fromDateOnly } from '../../lib/date-only.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import {
  ledgerKindSchema,
  paymentMethodSchema,
  type LedgerKind,
  type PaymentMethod,
  type SponsorStatus,
  type TripStatus,
} from '../../shared/enums.js';
import type { AccountingReportQuery, ReportSection, ReportSummaryDto } from './schema.js';

const DAY_MS = 86_400_000;

export interface Totals {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

export interface LedgerSection {
  totals: Totals;
  categories: { kind: LedgerKind; category: string; count: number; totalCents: number }[];
  entries: { occurredOn: Date; kind: LedgerKind; category: string; description: string | null; amountCents: number }[];
}

export interface FeesSection {
  collectedCents: number;
  overdueCents: number;
  payments: {
    paidAt: Date;
    memberName: string;
    description: string;
    method: PaymentMethod | null;
    amountCents: number;
    receiptNumber: number | null;
  }[];
  overdue: { dueDate: Date; memberName: string; description: string; amountCents: number }[];
}

export interface SponsorsSection {
  totalCents: number;
  items: { name: string; status: SponsorStatus; amountCents: number; contractStart: Date | null; contractEnd: Date | null }[];
}

export interface TripsSection {
  totalCostCents: number;
  items: { departAt: Date; destination: string; status: TripStatus; costCents: number | null }[];
}

export interface RefereesSection {
  totalFeeCents: number;
  reimbursedCents: number;
  items: { date: Date | null; refereeName: string; match: string; feeCents: number | null; reimbursedAt: Date | null }[];
}

export interface AccountingReport {
  society: { name: string; fiscalCode: string | null; address: string | null; city: string | null; email: string | null };
  period: { from: Date; to: Date };
  generatedAt: Date;
  ledger?: LedgerSection;
  fees?: FeesSection;
  sponsors?: SponsorsSection;
  trips?: TripsSection;
  referees?: RefereesSection;
}

type Db = TenantRequestContext['db'];

const memberName = (member: { firstName: string; lastName: string }): string => `${member.firstName} ${member.lastName}`;

async function loadLedger(db: Db, from: Date, toExclusive: Date): Promise<LedgerSection> {
  const rows = await db.ledgerEntry.findMany({
    where: { occurredOn: { gte: from, lt: toExclusive } },
    orderBy: [{ occurredOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const totals: Totals = { incomeCents: 0, expenseCents: 0, balanceCents: 0 };
  const categories = new Map<string, LedgerSection['categories'][number]>();
  for (const row of rows) {
    const kind = ledgerKindSchema.parse(row.kind);
    const sign = kind === 'INCOME' ? 1 : -1;
    if (kind === 'INCOME') totals.incomeCents += row.amountCents;
    else totals.expenseCents += row.amountCents;
    totals.balanceCents += sign * row.amountCents;
    const key = `${kind}:${row.category}`;
    const entry = categories.get(key) ?? { kind, category: row.category, count: 0, totalCents: 0 };
    entry.count += 1;
    entry.totalCents += row.amountCents;
    categories.set(key, entry);
  }
  return {
    totals,
    categories: [...categories.values()].sort(
      (a, b) => a.kind.localeCompare(b.kind) || b.totalCents - a.totalCents || a.category.localeCompare(b.category),
    ),
    entries: rows.map((row) => ({
      occurredOn: row.occurredOn,
      kind: ledgerKindSchema.parse(row.kind),
      category: row.category,
      description: row.description,
      amountCents: row.amountCents,
    })),
  };
}

// Cash basis: what was collected in the period; plus the fees due in the period that are still unpaid today.
async function loadFees(db: Db, from: Date, toExclusive: Date, now: Date): Promise<FeesSection> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [paid, pending] = await Promise.all([
    db.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lt: toExclusive } },
      include: { member: { select: { firstName: true, lastName: true } }, receipt: { select: { number: true } } },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    }),
    db.payment.findMany({
      where: { status: 'PENDING', dueDate: { gte: from, lt: toExclusive } },
      include: { member: { select: { firstName: true, lastName: true } } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const overdue = pending.filter((payment) => payment.dueDate < today);
  return {
    collectedCents: paid.reduce((sum, payment) => sum + payment.amountCents, 0),
    overdueCents: overdue.reduce((sum, payment) => sum + payment.amountCents, 0),
    payments: paid.map((payment) => ({
      paidAt: payment.paidAt ?? payment.createdAt,
      memberName: memberName(payment.member),
      description: payment.description,
      method: payment.method === null ? null : paymentMethodSchema.parse(payment.method),
      amountCents: payment.amountCents,
      receiptNumber: payment.receipt?.number ?? null,
    })),
    overdue: overdue.map((payment) => ({
      dueDate: payment.dueDate,
      memberName: memberName(payment.member),
      description: payment.description,
      amountCents: payment.amountCents,
    })),
  };
}

// Contracts that overlap the period (an open start or end counts as always).
async function loadSponsors(db: Db, from: Date, toExclusive: Date): Promise<SponsorsSection> {
  const rows = await db.sponsor.findMany({
    where: {
      AND: [
        { OR: [{ contractStart: null }, { contractStart: { lt: toExclusive } }] },
        { OR: [{ contractEnd: null }, { contractEnd: { gte: from } }] },
        { status: { not: 'PROSPECT' } },
      ],
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return {
    totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    items: rows.map((row) => ({
      name: row.name,
      status: row.status as SponsorStatus,
      amountCents: row.amountCents,
      contractStart: row.contractStart,
      contractEnd: row.contractEnd,
    })),
  };
}

async function loadTrips(db: Db, from: Date, toExclusive: Date): Promise<TripsSection> {
  const rows = await db.trip.findMany({
    where: { departAt: { gte: from, lt: toExclusive }, status: { not: 'CANCELLED' } },
    orderBy: [{ departAt: 'asc' }, { id: 'asc' }],
  });
  return {
    totalCostCents: rows.reduce((sum, row) => sum + (row.costCents ?? 0), 0),
    items: rows.map((row) => ({
      departAt: row.departAt,
      destination: row.destination,
      status: row.status as TripStatus,
      costCents: row.costCents,
    })),
  };
}

// A designation belongs to the day of the match (played date, else the event date).
async function loadReferees(db: Db, from: Date, toExclusive: Date): Promise<RefereesSection> {
  const range = { gte: from, lt: toExclusive };
  const rows = await db.refereeAssignment.findMany({
    where: { OR: [{ match: { playedAt: range } }, { match: { playedAt: null, event: { startsAt: range } } }] },
    include: {
      referee: { select: { firstName: true, lastName: true } },
      match: { include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } }, event: { select: { startsAt: true } } } },
    },
  });
  const items = rows
    .map((row) => ({
      date: row.match.playedAt ?? row.match.event?.startsAt ?? null,
      refereeName: memberName(row.referee),
      match: `${row.match.homeTeam.name} - ${row.match.awayTeam.name}`,
      feeCents: row.feeCents,
      reimbursedAt: row.reimbursedAt,
    }))
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0) || a.refereeName.localeCompare(b.refereeName));
  return {
    totalFeeCents: items.reduce((sum, item) => sum + (item.feeCents ?? 0), 0),
    reimbursedCents: items.reduce((sum, item) => sum + (item.reimbursedAt ? (item.feeCents ?? 0) : 0), 0),
    items,
  };
}

// Gathers the data of the requested sections for the period [from, to] (both days included).
export async function buildAccountingReport(
  { db }: Pick<TenantRequestContext, 'db'>,
  query: AccountingReportQuery,
  now = new Date(),
): Promise<AccountingReport> {
  const from = fromDateOnly(query.from);
  const to = fromDateOnly(query.to);
  const toExclusive = new Date(to.getTime() + DAY_MS);
  const wants = (section: ReportSection): boolean => query.sections.includes(section);

  const society = await db.society.findFirstOrThrow();
  const [ledger, fees, sponsors, trips, referees] = await Promise.all([
    wants('LEDGER') ? loadLedger(db, from, toExclusive) : undefined,
    wants('FEES') ? loadFees(db, from, toExclusive, now) : undefined,
    wants('SPONSORS') ? loadSponsors(db, from, toExclusive) : undefined,
    wants('TRIPS') ? loadTrips(db, from, toExclusive) : undefined,
    wants('REFEREES') ? loadReferees(db, from, toExclusive) : undefined,
  ]);

  return {
    society: {
      name: society.name,
      fiscalCode: society.fiscalCode,
      address: society.address,
      city: society.city,
      email: society.email,
    },
    period: { from, to },
    generatedAt: now,
    ...(ledger ? { ledger } : {}),
    ...(fees ? { fees } : {}),
    ...(sponsors ? { sponsors } : {}),
    ...(trips ? { trips } : {}),
    ...(referees ? { referees } : {}),
  };
}

// What each section holds, for the screen that lets the administrator choose what to export.
export function summarizeReport(report: AccountingReport, query: AccountingReportQuery): ReportSummaryDto {
  const sections: ReportSummaryDto['sections'] = [];
  if (report.ledger) {
    sections.push({ section: 'LEDGER', records: report.ledger.entries.length, amountCents: report.ledger.totals.balanceCents });
  }
  if (report.fees) {
    sections.push({ section: 'FEES', records: report.fees.payments.length + report.fees.overdue.length, amountCents: report.fees.collectedCents });
  }
  if (report.sponsors) {
    sections.push({ section: 'SPONSORS', records: report.sponsors.items.length, amountCents: report.sponsors.totalCents });
  }
  if (report.trips) {
    sections.push({ section: 'TRIPS', records: report.trips.items.length, amountCents: report.trips.totalCostCents });
  }
  if (report.referees) {
    sections.push({ section: 'REFEREES', records: report.referees.items.length, amountCents: report.referees.totalFeeCents });
  }
  return { period: { from: query.from, to: query.to }, sections };
}
