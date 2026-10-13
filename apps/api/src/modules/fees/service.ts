import type { FeePlan, Prisma } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { isAutomationEnabled, logEventRun } from '../../jobs/event-automations.js';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { withIdempotency, type IdempotentOutcome, type TenantTx } from '../../lib/idempotency.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { can } from '../../rbac/permissions.js';
import { feeKindSchema, paymentMethodSchema, type PaymentStatus } from '../../shared/enums.js';
import { formatDateOnly, parseDateOnly, startOfUtcDay } from '../documents/status.js';
import { ownMemberFilter } from '../members/access.js';
import { formatReceiptCode, renderReceiptPdf } from './receipt-pdf.js';
import type {
  CreateFeeBody,
  CreateFeePlanBody,
  FeeDto,
  FeePlanDto,
  FeesSummaryDto,
  FeesSummaryQuery,
  GenerateFeesBody,
  GenerateFeesResult,
  ListFeePlansQuery,
  ListFeesQuery,
  PayFeeBody,
  UpdateFeePlanBody,
} from './schema.js';

// ---------------------------------------------------------------------------
// Fee plans
// ---------------------------------------------------------------------------

function toPlanDto(plan: FeePlan): FeePlanDto {
  return {
    id: plan.id,
    name: plan.name,
    kind: feeKindSchema.parse(plan.kind),
    amountCents: plan.amountCents,
    currency: plan.currency,
    teamId: plan.teamId,
    seasonId: plan.seasonId,
    installments: plan.installments,
    dueDay: plan.dueDay,
    isActive: plan.isActive,
    createdAt: toIso(plan.createdAt),
    updatedAt: toIso(plan.updatedAt),
  };
}

// Ids received from the client are checked through the scoped client: a foreign-tenant id looks "not found".
async function assertPlanReferences({ db }: TenantRequestContext, teamId?: string | null, seasonId?: string | null) {
  if (teamId && !(await db.team.findFirst({ where: { id: teamId }, select: { id: true } }))) throw notFound('Team');
  if (seasonId && !(await db.season.findFirst({ where: { id: seasonId }, select: { id: true } }))) throw notFound('Season');
}

export const feePlanService: CrudService<FeePlanDto, CreateFeePlanBody, UpdateFeePlanBody, ListFeePlansQuery> = {
  async list({ db }, query) {
    const rows = await db.feePlan.findMany({
      where: {
        ...(query.teamId ? { teamId: query.teamId } : {}),
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toPlanDto), page: page.page };
  },

  async get({ db }, id) {
    const plan = await db.feePlan.findFirst({ where: { id } });
    if (!plan) throw notFound('Fee plan');
    return toPlanDto(plan);
  },

  async create(ctx, body) {
    await assertPlanReferences(ctx, body.teamId, body.seasonId);
    return toPlanDto(await ctx.db.feePlan.create({ data: { ...body, societyId: ctx.auth.societyId } }));
  },

  async update(ctx, id, body) {
    await assertPlanReferences(ctx, body.teamId, body.seasonId);
    // A missing / foreign-tenant id makes Prisma throw P2025, mapped to 404 by the error plugin.
    return toPlanDto(await ctx.db.feePlan.update({ where: { id }, data: body }));
  },

  async remove({ db }, id) {
    if ((await db.payment.count({ where: { feePlanId: id } })) > 0) {
      throw conflict('fee_plan_in_use', 'The plan has generated fees: deactivate it instead of deleting it');
    }
    const result = await db.feePlan.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Fee plan');
  },
};

export async function generateFees(
  ctx: TenantRequestContext,
  planId: string,
  body: GenerateFeesBody,
): Promise<GenerateFeesResult> {
  const { db, auth } = ctx;
  const plan = await db.feePlan.findFirst({ where: { id: planId } });
  if (!plan) throw notFound('Fee plan');
  if (!plan.isActive) throw conflict('fee_plan_inactive', 'The fee plan is not active');

  const targets = await db.member.findMany({
    where: {
      status: 'ACTIVE',
      ...(plan.teamId ? { teamMemberships: { some: { teamId: plan.teamId, leftAt: null } } } : {}),
      ...(body.memberIds ? { id: { in: body.memberIds } } : {}),
    },
    select: { id: true },
  });
  if (body.memberIds && targets.length !== new Set(body.memberIds).size) {
    throw unprocessable('members_not_in_plan_target', 'Some members are not active members of the plan target group');
  }

  const dueDate = parseDateOnly(body.dueDate);
  const existing = await db.payment.findMany({
    where: { feePlanId: plan.id, dueDate, memberId: { in: targets.map((member) => member.id) } },
    select: { memberId: true },
  });
  const alreadyBilled = new Set(existing.map((payment) => payment.memberId));
  const toCreate = targets.filter((member) => !alreadyBilled.has(member.id));

  try {
    await db.payment.createMany({
      data: toCreate.map((member) => ({
        societyId: auth.societyId,
        memberId: member.id,
        feePlanId: plan.id,
        description: body.description ?? plan.name,
        amountCents: plan.amountCents,
        currency: plan.currency,
        dueDate,
      })),
    });
  } catch (error) {
    // A concurrent generation of the same plan and due date won the (feePlanId, memberId, dueDate) constraint.
    if (isUniqueViolation(error)) throw conflict('fees_already_generated', 'These fees are already being generated');
    throw error;
  }
  return { created: toCreate.length, skipped: alreadyBilled.size };
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

const feeInclude = {
  member: {
    select: {
      firstName: true,
      lastName: true,
      teamMemberships: { where: { leftAt: null }, select: { team: { select: { id: true, name: true } } } },
    },
  },
  receipt: true,
} satisfies Prisma.PaymentInclude;

type FeeRow = Prisma.PaymentGetPayload<{ include: typeof feeInclude }>;

// OVERDUE is derived, never stored: a PENDING fee whose due day is before today (UTC).
export function statusOf(payment: { status: string; dueDate: Date }, now: Date): PaymentStatus {
  if (payment.status === 'PAID') return 'PAID';
  if (payment.status === 'CANCELLED') return 'CANCELLED';
  return payment.dueDate < startOfUtcDay(now) ? 'OVERDUE' : 'PENDING';
}

function toFeeDto(row: FeeRow, now: Date): FeeDto {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: `${row.member.firstName} ${row.member.lastName}`,
    teams: row.member.teamMemberships.map((membership) => membership.team),
    feePlanId: row.feePlanId,
    description: row.description,
    amountCents: row.amountCents,
    currency: row.currency,
    dueDate: formatDateOnly(row.dueDate),
    status: statusOf(row, now),
    paidAt: toIsoOrNull(row.paidAt),
    method: row.method === null ? null : paymentMethodSchema.parse(row.method),
    payerName: row.payerName,
    payerEmail: row.payerEmail,
    reference: row.reference,
    reminderCount: row.reminderCount,
    lastReminderAt: toIsoOrNull(row.lastReminderAt),
    receipt: row.receipt
      ? {
          id: row.receipt.id,
          number: row.receipt.number,
          code: formatReceiptCode(row.receipt.number),
          issuedAt: toIso(row.receipt.issuedAt),
        }
      : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

// Staff (payments:read) see every fee of the society; athletes and guardians only those of themselves / their children.
function accessFilter(ctx: TenantRequestContext): Prisma.PaymentWhereInput {
  return can(ctx.auth.roles, 'payments:read') ? {} : { member: ownMemberFilter(ctx) };
}

function statusFilter(status: PaymentStatus, today: Date): Prisma.PaymentWhereInput {
  switch (status) {
    case 'PAID':
    case 'CANCELLED':
      return { status };
    case 'PENDING':
      return { status: 'PENDING', dueDate: { gte: today } };
    case 'OVERDUE':
      return { status: 'PENDING', dueDate: { lt: today } };
  }
}

function scopeFilter(ctx: TenantRequestContext, filters: FeesSummaryQuery): Prisma.PaymentWhereInput {
  const memberFilters: Prisma.MemberWhereInput[] = [];
  if (filters.teamId) memberFilters.push({ teamMemberships: { some: { teamId: filters.teamId, leftAt: null } } });
  if (filters.q) memberFilters.push({ OR: [{ firstName: { contains: filters.q } }, { lastName: { contains: filters.q } }] });
  return {
    AND: [
      accessFilter(ctx),
      memberFilters.length > 0 ? { member: { AND: memberFilters } } : {},
      filters.memberId ? { memberId: filters.memberId } : {},
      filters.feePlanId ? { feePlanId: filters.feePlanId } : {},
      {
        dueDate: {
          ...(filters.dueFrom ? { gte: parseDateOnly(filters.dueFrom) } : {}),
          ...(filters.dueTo ? { lte: parseDateOnly(filters.dueTo) } : {}),
        },
      },
    ],
  };
}

export async function listFees(
  ctx: TenantRequestContext,
  filters: Omit<ListFeesQuery, keyof PaginationQuery>,
  query: PaginationQuery,
  now = new Date(),
): Promise<Page<FeeDto>> {
  const today = startOfUtcDay(now);
  const rows = await ctx.db.payment.findMany({
    where: { AND: [scopeFilter(ctx, filters), filters.status ? statusFilter(filters.status, today) : {}] },
    include: feeInclude,
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map((row) => toFeeDto(row, now)), page: page.page };
}

export async function getFee(ctx: TenantRequestContext, id: string, now = new Date()): Promise<FeeDto> {
  const row = await ctx.db.payment.findFirst({ where: { AND: [{ id }, accessFilter(ctx)] }, include: feeInclude });
  if (!row) throw notFound('Fee');
  return toFeeDto(row, now);
}

export async function createFee(ctx: TenantRequestContext, body: CreateFeeBody, now = new Date()): Promise<FeeDto> {
  const { db, auth } = ctx;
  if (!(await db.member.findFirst({ where: { id: body.memberId }, select: { id: true } }))) throw notFound('Member');
  if (body.feePlanId && !(await db.feePlan.findFirst({ where: { id: body.feePlanId }, select: { id: true } }))) {
    throw notFound('Fee plan');
  }
  try {
    const row = await db.payment.create({
      data: {
        societyId: auth.societyId,
        memberId: body.memberId,
        feePlanId: body.feePlanId ?? null,
        description: body.description,
        amountCents: body.amountCents,
        dueDate: parseDateOnly(body.dueDate),
      },
      include: feeInclude,
    });
    return toFeeDto(row, now);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('fee_already_exists', 'The member already has a fee of this plan for that due date');
    }
    throw error;
  }
}

export async function feesSummary(
  ctx: TenantRequestContext,
  filters: FeesSummaryQuery,
  now = new Date(),
): Promise<FeesSummaryDto> {
  const { db } = ctx;
  const today = startOfUtcDay(now);
  const scope = scopeFilter(ctx, filters);
  const sum = (extra: Prisma.PaymentWhereInput) =>
    db.payment.aggregate({ where: { AND: [scope, extra] }, _sum: { amountCents: true }, _count: { _all: true } });

  const [paid, pending, overdue, reminders] = await Promise.all([
    sum(statusFilter('PAID', today)),
    sum(statusFilter('PENDING', today)),
    sum(statusFilter('OVERDUE', today)),
    db.payment.aggregate({ where: scope, _sum: { reminderCount: true } }),
  ]);
  const cents = (result: { _sum: { amountCents: number | null } }) => result._sum.amountCents ?? 0;
  return {
    incassatoCents: cents(paid),
    daIncassareCents: cents(pending) + cents(overdue),
    scadutoCents: cents(overdue),
    promemoriaInviati: reminders._sum.reminderCount ?? 0,
    paidCount: paid._count._all,
    pendingCount: pending._count._all,
    overdueCount: overdue._count._all,
  };
}

// Next progressive receipt number of the society. Runs INSIDE the payment transaction: the atomic increment
// takes the row lock, so concurrent payments get distinct numbers, and a rolled-back payment releases its number
// (no gaps). The very first receipt creates the counter row (SQLite serialises writers; on PostgreSQL use
// INSERT ... ON CONFLICT here).
async function nextReceiptNumber(tx: TenantTx, societyId: string): Promise<number> {
  const bumped = await tx.receiptSequence.updateMany({ where: {}, data: { lastNumber: { increment: 1 } } });
  if (bumped.count === 0) {
    await tx.receiptSequence.create({ data: { societyId, lastNumber: 1 } });
    return 1;
  }
  const sequence = await tx.receiptSequence.findFirstOrThrow({});
  return sequence.lastNumber;
}

const RECEIPTS_AUTOMATION_KEY = 'receipts';

// Numbers and stores the receipt of a paid fee and records the action in the automation's execution log.
async function issueReceiptIn(tx: TenantTx, societyId: string, paymentId: string, now: Date): Promise<number> {
  const number = await nextReceiptNumber(tx, societyId);
  await tx.receipt.create({ data: { societyId, paymentId, number, issuedAt: now } });
  await logEventRun(tx, {
    societyId,
    key: RECEIPTS_AUTOMATION_KEY,
    runKey: `receipt:${paymentId}`,
    result: { paymentId, number },
    now,
  });
  return number;
}

// Manual issue for fees paid while the "receipts" automation was off.
export async function issueReceipt(ctx: TenantRequestContext, id: string, now = new Date()): Promise<FeeDto> {
  return ctx.db.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id }, include: { receipt: true } });
    if (!payment) throw notFound('Fee');
    if (payment.status !== 'PAID') throw conflict('fee_not_paid', 'A receipt can be issued only for a paid fee');
    if (payment.receipt) throw conflict('receipt_already_issued', 'The fee already has a receipt');
    await issueReceiptIn(tx, ctx.auth.societyId, id, now);
    return toFeeDto(await tx.payment.findFirstOrThrow({ where: { id }, include: feeInclude }), now);
  });
}

// Registers a payment and issues its numbered receipt atomically. Must be called with an Idempotency-Key.
export async function payFee(
  ctx: TenantRequestContext,
  id: string,
  body: PayFeeBody,
  idempotencyKey: string,
  now = new Date(),
): Promise<IdempotentOutcome<FeeDto>> {
  const paidAt = body.paidAt ? new Date(body.paidAt) : now;
  if (paidAt > now) throw unprocessable('paid_at_in_future', 'The payment date cannot be in the future');

  return withIdempotency(ctx, idempotencyKey, { operation: 'pay-fee', id, body }, async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id }, include: { member: true } });
    if (!payment) throw notFound('Fee');
    if (payment.status === 'PAID') throw conflict('fee_already_paid', 'The fee is already paid');
    if (payment.status === 'CANCELLED') throw conflict('fee_cancelled', 'The fee is cancelled');

    // Conditional update: a concurrent payment of the same fee (other key) leaves count = 0.
    const claimed = await tx.payment.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'PAID',
        paidAt,
        method: body.method,
        payerName: body.payerName ?? `${payment.member.firstName} ${payment.member.lastName}`,
        payerEmail: body.payerEmail ?? payment.member.email,
        reference: body.reference ?? null,
        recordedById: ctx.auth.userId,
      },
    });
    if (claimed.count === 0) throw conflict('fee_already_paid', 'The fee is already paid');

    // SPEC 08 "Emettere le ricevute": with the automation off the payment is recorded and the receipt is issued by hand.
    if (await isAutomationEnabled(tx, RECEIPTS_AUTOMATION_KEY)) await issueReceiptIn(tx, ctx.auth.societyId, id, now);

    const row = await tx.payment.findFirstOrThrow({ where: { id }, include: feeInclude });
    return { status: 200, body: toFeeDto(row, now) };
  });
}

export interface ReceiptFile {
  filename: string;
  content: Buffer;
}

// Receipts are rendered on demand from the stored data: the PDF is always consistent with the database.
export async function getReceiptFile(ctx: TenantRequestContext, feeId: string): Promise<ReceiptFile> {
  const access: Prisma.PaymentWhereInput = can(ctx.auth.roles, 'receipts:read') ? {} : { member: ownMemberFilter(ctx) };
  const payment = await ctx.db.payment.findFirst({
    where: { AND: [{ id: feeId }, access] },
    include: { member: true, receipt: true },
  });
  if (!payment) throw notFound('Fee');
  if (!payment.receipt || !payment.paidAt || !payment.method) throw notFound('Receipt');

  const society = await ctx.db.society.findFirst({ where: { id: ctx.auth.societyId } });
  if (!society) throw forbidden();
  const content = await renderReceiptPdf({
    society,
    number: payment.receipt.number,
    issuedAt: payment.receipt.issuedAt,
    payerName: payment.payerName ?? `${payment.member.firstName} ${payment.member.lastName}`,
    memberName: `${payment.member.firstName} ${payment.member.lastName}`,
    description: payment.description,
    amountCents: payment.amountCents,
    method: paymentMethodSchema.parse(payment.method),
    paidAt: payment.paidAt,
    reference: payment.reference,
  });
  return { filename: `ricevuta-${formatReceiptCode(payment.receipt.number)}.pdf`, content };
}
