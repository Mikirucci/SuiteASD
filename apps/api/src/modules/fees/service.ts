import type { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
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
import { notifyAdministration } from '../notifications/admin-alerts.js';
import { createNotification } from '../notifications/service.js';
import { renderNotification } from '../notifications/templates.js';
import { resolveRecipients } from '../notifications/recipients.js';
import { installmentDescription, syncPlanFees } from './billing.js';
import { formatReceiptCode, renderReceiptPdf } from './receipt-pdf.js';
import type {
  CreateFeeBody,
  CreateFeePlanBody,
  FeeDto,
  FeePlanDto,
  FeesSummaryDto,
  FeesSummaryQuery,
  ListFeePlansQuery,
  ListFeesQuery,
  PayFeeBody,
  UpdateFeePlanBody,
} from './schema.js';

// ---------------------------------------------------------------------------
// Fee plans
// ---------------------------------------------------------------------------

const planInclude = { teams: { select: { teamId: true } }, schedule: { select: { number: true } } } satisfies Prisma.FeePlanInclude;

type PlanRow = Prisma.FeePlanGetPayload<{ include: typeof planInclude }>;

function toPlanDto(plan: PlanRow): FeePlanDto {
  return {
    id: plan.id,
    name: plan.name,
    kind: feeKindSchema.parse(plan.kind),
    amountCents: plan.amountCents,
    currency: plan.currency,
    teamIds: plan.teams.map((team) => team.teamId).sort(),
    seasonId: plan.seasonId,
    installments: plan.schedule.length,
    isActive: plan.isActive,
    createdAt: toIso(plan.createdAt),
    updatedAt: toIso(plan.updatedAt),
  };
}

// Ids received from the client are checked through the scoped client: a foreign-tenant id looks "not found".
async function assertPlanReferences({ db }: TenantRequestContext, teamIds: readonly string[], seasonId?: string | null) {
  if (teamIds.length > 0 && (await db.team.count({ where: { id: { in: [...teamIds] } } })) !== teamIds.length) {
    throw notFound('Team');
  }
  if (seasonId && !(await db.season.findFirst({ where: { id: seasonId }, select: { id: true } }))) throw notFound('Season');
}

export const feePlanService: CrudService<FeePlanDto, CreateFeePlanBody, UpdateFeePlanBody, ListFeePlansQuery> = {
  async list({ db }, query) {
    const rows = await db.feePlan.findMany({
      where: query.isActive === undefined ? {} : { isActive: query.isActive },
      include: planInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toPlanDto), page: page.page };
  },

  async get({ db }, id) {
    const plan = await db.feePlan.findFirst({ where: { id }, include: planInclude });
    if (!plan) throw notFound('Fee plan');
    return toPlanDto(plan);
  },

  // The plan and its fees are written together: a plan never exists half-billed.
  async create(ctx, body) {
    const { teamIds, dueDates, ...planData } = body;
    await assertPlanReferences(ctx, teamIds, body.seasonId);

    const targets = await ctx.db.member.findMany({
      where: {
        status: 'ACTIVE',
        ...(teamIds.length > 0 ? { teamMemberships: { some: { teamId: { in: teamIds }, leftAt: null } } } : {}),
      },
      select: { id: true },
    });

    return ctx.db.$transaction(async (tx) => {
      const plan = await tx.feePlan.create({ data: { ...planData, societyId: ctx.auth.societyId } });
      if (teamIds.length > 0) {
        await tx.feePlanTeam.createMany({
          data: teamIds.map((teamId) => ({ societyId: ctx.auth.societyId, feePlanId: plan.id, teamId })),
        });
      }
      const sorted = [...dueDates].sort();
      // The schedule stays on the plan, so whoever becomes a target later is billed from it (fees/billing.ts)
      await tx.feePlanInstallment.createMany({
        data: sorted.map((dueDate, index) => ({
          societyId: ctx.auth.societyId,
          feePlanId: plan.id,
          number: index + 1,
          dueDate: parseDateOnly(dueDate),
        })),
      });
      await tx.payment.createMany({
        data: sorted.flatMap((dueDate, index) =>
          targets.map((member) => ({
            societyId: ctx.auth.societyId,
            memberId: member.id,
            feePlanId: plan.id,
            description: installmentDescription(plan.name, index + 1, sorted.length),
            amountCents: plan.amountCents,
            currency: plan.currency,
            dueDate: parseDateOnly(dueDate),
          })),
        ),
      });
      return toPlanDto(await tx.feePlan.findFirstOrThrow({ where: { id: plan.id }, include: planInclude }));
    });
  },

  async update(ctx, id, body) {
    // A missing / foreign-tenant id makes Prisma throw P2025, mapped to 404 by the error plugin.
    const before = await ctx.db.feePlan.findFirst({ where: { id }, select: { isActive: true } });
    const plan = await ctx.db.feePlan.update({ where: { id }, data: body, include: planInclude });
    // Switched on again: the people who became targets while it was off are billed now
    if (before && !before.isActive && plan.isActive) await syncPlanFees(ctx.db, ctx.auth.societyId, id);
    return toPlanDto(plan);
  },

  async remove({ db }, id) {
    if ((await db.payment.count({ where: { feePlanId: id } })) > 0) {
      throw conflict('fee_plan_in_use', 'The plan has generated fees: deactivate it instead of deleting it');
    }
    const result = await db.feePlan.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Fee plan');
  },
};

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
    claimedAt: toIsoOrNull(row.claimedAt),
    receipt: row.receipt
      ? {
          id: row.receipt.id,
          number: row.receipt.number,
          code: formatReceiptCode(row.receipt.number),
          issuedAt: toIso(row.receipt.issuedAt),
          sentAt: toIsoOrNull(row.receipt.sentAt),
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
    where: {
      AND: [
        scopeFilter(ctx, filters),
        filters.status ? statusFilter(filters.status, today) : {},
        filters.claimed === undefined ? {} : { status: 'PENDING', claimedAt: filters.claimed ? { not: null } : null },
      ],
    },
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

// The payer (athlete, or guardian for a child) reports having paid, so the administration checks the bank and
// records the payment. Only the first report is a news item: repeating it changes nothing.
export async function claimPayment(
  ctx: TenantRequestContext,
  id: string,
  now = new Date(),
): Promise<{ fee: FeeDto; firstClaim: boolean }> {
  // Always the own-data filter, even for somebody who also holds a staff role: one reports their own payments only.
  const row = await ctx.db.payment.findFirst({ where: { id, member: ownMemberFilter(ctx) }, include: feeInclude });
  if (!row) throw notFound('Fee');
  if (row.status === 'PAID') throw conflict('fee_already_paid', 'The fee is already paid');
  if (row.status === 'CANCELLED') throw conflict('fee_cancelled', 'The fee is cancelled');
  if (row.claimedAt) return { fee: toFeeDto(row, now), firstClaim: false };

  // Conditional update: of two concurrent reports only one wins and notifies.
  const claimed = await ctx.db.payment.updateMany({ where: { id, status: 'PENDING', claimedAt: null }, data: { claimedAt: now } });
  const updated = await ctx.db.payment.findFirstOrThrow({ where: { id }, include: feeInclude });
  return { fee: toFeeDto(updated, now), firstClaim: claimed.count > 0 };
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

// The other administrators hear about a payment as it is recorded (the one who recorded it already knows). Best
// effort: a failure here must not undo a payment that went through.
export async function alertPaymentReceived(ctx: TenantRequestContext, fee: FeeDto, log: FastifyBaseLogger): Promise<void> {
  try {
    await notifyAdministration(ctx.db, {
      societyId: ctx.auth.societyId,
      template: {
        type: 'ADMIN_PAYMENT_RECEIVED',
        memberName: fee.memberName,
        description: fee.description,
        amountCents: fee.amountCents,
      },
      dedupeKey: `payment-received:${fee.id}`,
      data: { feeId: fee.id, memberId: fee.memberId },
      exceptUserId: ctx.auth.userId,
      now: new Date(),
    });
  } catch (error) {
    log.error({ err: error, feeId: fee.id }, 'could not notify the administration of a payment');
  }
}

// Best effort like the payment alert: a notification failure must not undo the report.
export async function alertPaymentClaimed(ctx: TenantRequestContext, fee: FeeDto, log: FastifyBaseLogger): Promise<void> {
  try {
    await notifyAdministration(ctx.db, {
      societyId: ctx.auth.societyId,
      template: {
        type: 'ADMIN_PAYMENT_CLAIMED',
        memberName: fee.memberName,
        description: fee.description,
        amountCents: fee.amountCents,
      },
      dedupeKey: `payment-claimed:${fee.id}`,
      data: { feeId: fee.id, memberId: fee.memberId },
      exceptUserId: ctx.auth.userId,
      now: new Date(),
    });
  } catch (error) {
    log.error({ err: error, feeId: fee.id }, 'could not notify the administration of a payment claim');
  }
}

// Tells the payer (the member's account and the guardians) and the whole administration, the one who recorded the
// payment included, that the receipt exists, then stamps Receipt.sentAt. Email carries the text only: the PDF is
// served by GET /fees/:id/receipt (the email transport has no attachments). Best effort, and idempotent per receipt.
export async function notifyReceiptIssued(ctx: TenantRequestContext, fee: FeeDto, log: FastifyBaseLogger): Promise<void> {
  const { receipt } = fee;
  if (!receipt) return;
  try {
    const { db, auth } = ctx;
    const [payers, administration] = await Promise.all([
      resolveRecipients(db, { kind: 'MEMBERS', memberIds: [fee.memberId] }),
      resolveRecipients(db, { kind: 'ROLES', roles: ['ADMIN', 'SEGRETERIA'] }),
    ]);
    const audiences = [
      { audience: 'PAYER', userIds: payers },
      { audience: 'ADMINISTRATION', userIds: administration },
    ] as const;
    let written = 0;
    for (const { audience, userIds } of audiences) {
      const { title, body } = renderNotification({
        type: 'RECEIPT_ISSUED',
        audience,
        code: receipt.code,
        memberName: fee.memberName,
        description: fee.description,
        amountCents: fee.amountCents,
      });
      written += await createNotification(db, {
        societyId: auth.societyId,
        userIds,
        type: 'RECEIPT_ISSUED',
        title,
        body,
        dedupeKey: `receipt-issued:${receipt.id}`,
        data: { feeId: fee.id, memberId: fee.memberId },
      });
    }
    if (written > 0) await db.receipt.updateMany({ where: { id: receipt.id, sentAt: null }, data: { sentAt: new Date() } });
  } catch (error) {
    log.error({ err: error, feeId: fee.id }, 'could not notify the receipt');
  }
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
