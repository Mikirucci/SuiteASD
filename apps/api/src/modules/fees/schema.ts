import { z } from 'zod';
import { patchBodySchema } from '../../lib/crud-routes.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { emailSchema, isoDateTimeSchema } from '../../lib/schemas.js';
import { feeKindSchema, paymentMethodSchema, paymentStatusSchema } from '../../shared/enums.js';

const idRef = z.string().min(1).max(64);
const amountCentsSchema = z.number().int().min(1).max(10_000_000).describe('Amount in euro cents');
// Dates without a time ("2026-11-10") are stored as UTC midnight.
const dateOnlySchema = z.iso.date();

// ---------------------------------------------------------------------------
// Fee plans
// ---------------------------------------------------------------------------

export const createFeePlanBodySchema = z.object({
  name: z.string().trim().min(1).max(120).describe('e.g. "Quota novembre"'),
  kind: feeKindSchema.default('MONTHLY'),
  amountCents: amountCentsSchema,
  teamId: idRef.optional().describe('Plan for one team; omitted = every active member of the society'),
  seasonId: idRef.optional(),
  installments: z.number().int().min(1).max(36).optional().describe('Number of monthly installments, informative'),
  dueDay: z.number().int().min(1).max(28).optional().describe('Day of the month the installment is due, informative'),
  isActive: z.boolean().default(true),
});

export const updateFeePlanBodySchema = patchBodySchema({
  name: createFeePlanBodySchema.shape.name,
  kind: feeKindSchema,
  amountCents: amountCentsSchema,
  teamId: idRef.nullable(),
  seasonId: idRef.nullable(),
  installments: createFeePlanBodySchema.shape.installments.nullable(),
  dueDay: createFeePlanBodySchema.shape.dueDay.nullable(),
  isActive: z.boolean(),
});

export const listFeePlansQuerySchema = paginationQuerySchema.extend({
  teamId: idRef.optional(),
  isActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});

export const feePlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: feeKindSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  teamId: z.string().nullable(),
  seasonId: z.string().nullable(),
  installments: z.number().int().nullable(),
  dueDay: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const generateFeesBodySchema = z.object({
  dueDate: dateOnlySchema.describe('Due date of the generated fees'),
  description: z.string().trim().min(1).max(200).optional().describe('Defaults to the plan name'),
  memberIds: z.array(idRef).min(1).max(500).optional().describe('Restrict to these members (default: whole target group)'),
});

export const generateFeesResultSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int().describe('Members that already had a fee of this plan for the same due date'),
});

// ---------------------------------------------------------------------------
// Fees (payments)
// ---------------------------------------------------------------------------

export const createFeeBodySchema = z.object({
  memberId: idRef,
  description: z.string().trim().min(1).max(200),
  amountCents: amountCentsSchema,
  dueDate: dateOnlySchema,
  feePlanId: idRef.optional(),
});

export const listFeesQuerySchema = paginationQuerySchema.extend({
  status: paymentStatusSchema.optional(),
  memberId: idRef.optional(),
  teamId: idRef.optional(),
  feePlanId: idRef.optional(),
  q: z.string().trim().min(1).max(80).optional().describe('Substring of the member first or last name'),
  dueFrom: dateOnlySchema.optional(),
  dueTo: dateOnlySchema.optional(),
  claimed: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .describe('true: unpaid fees the payer reported as paid; false: unpaid fees nobody reported'),
});

export const feesSummaryQuerySchema = listFeesQuerySchema.omit({ limit: true, cursor: true, status: true, claimed: true });

export const payFeeBodySchema = z.object({
  method: paymentMethodSchema,
  paidAt: isoDateTimeSchema.optional().describe('Defaults to now; cannot be in the future'),
  payerName: z.string().trim().min(1).max(120).optional(),
  payerEmail: emailSchema.optional(),
  reference: z.string().trim().min(1).max(120).optional().describe('e.g. bank transfer reference'),
});

export const receiptSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  code: z.string().describe('Zero-padded number, e.g. "0147"'),
  issuedAt: isoDateTimeSchema,
  sentAt: isoDateTimeSchema.nullable().describe('When the receipt notifications went out; null until then'),
});

export const feeSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  memberName: z.string(),
  teams: z.array(z.object({ id: z.string(), name: z.string() })),
  feePlanId: z.string().nullable(),
  description: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  dueDate: z.iso.date(),
  status: paymentStatusSchema.describe('OVERDUE is derived: PENDING with a past due date'),
  paidAt: isoDateTimeSchema.nullable(),
  method: paymentMethodSchema.nullable(),
  payerName: z.string().nullable(),
  payerEmail: z.string().nullable(),
  reference: z.string().nullable(),
  reminderCount: z.number().int(),
  lastReminderAt: isoDateTimeSchema.nullable(),
  claimedAt: isoDateTimeSchema.nullable().describe('When the payer reported having paid ("Ho pagato"); kept after the payment is recorded'),
  receipt: receiptSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const feesSummarySchema = z.object({
  incassatoCents: z.number().int().describe('Sum of the paid fees'),
  daIncassareCents: z.number().int().describe('Sum of pending and overdue fees'),
  scadutoCents: z.number().int().describe('Part of daIncassareCents already past its due date'),
  promemoriaInviati: z.number().int().describe('Reminders sent for the fees in scope'),
  paidCount: z.number().int(),
  pendingCount: z.number().int(),
  overdueCount: z.number().int(),
});

// ---------------------------------------------------------------------------
// Plan report (the Pagamenti page: one card per plan, people inside)
// ---------------------------------------------------------------------------

export const personPaymentStatusSchema = z
  .enum(['PAID', 'PENDING', 'OVERDUE'])
  .describe('PAID: nothing left to pay; PENDING: something to pay, nothing late; OVERDUE: at least one fee is late');

export const planStatsSchema = z.object({
  incassatoCents: z.number().int().describe('Sum of the paid fees of the plan'),
  daIncassareCents: z.number().int().describe('Sum of pending and overdue fees of the plan'),
  scadutoCents: z.number().int().describe('Part of daIncassareCents already past its due date'),
  paidPeople: z.number().int().describe('People with nothing left to pay'),
  pendingPeople: z.number().int().describe('People with fees to pay, none of them late'),
  overduePeople: z.number().int().describe('People with at least one late fee'),
});

export const planReportSchema = z.object({
  data: z.array(planStatsSchema.extend({ feePlanId: z.string() })).describe('Plans that have at least one fee'),
});

export const planPeopleQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional().describe('Substring of the member name'),
  teamId: idRef.optional(),
  status: personPaymentStatusSchema.optional(),
});

export const planPersonSchema = z.object({
  memberId: z.string(),
  memberName: z.string(),
  teams: z.array(z.object({ id: z.string(), name: z.string() })),
  totalDueCents: z.number().int().describe('What the person still has to pay in this plan; 0 when settled'),
  allPlansDueCents: z
    .number()
    .int()
    .describe('What the person still has to pay across every fee plan of the society; 0 when settled'),
  paidCents: z.number().int(),
  status: personPaymentStatusSchema,
  feesCount: z.number().int(),
  nextDueDate: z.iso.date().nullable().describe('Earliest due date among the unpaid fees'),
});

export const planPeopleSchema = z.object({
  stats: planStatsSchema.describe('Figures of the whole plan, whatever the filters'),
  people: z.array(planPersonSchema).describe('Ordered by name'),
});

export type PlanStats = z.infer<typeof planStatsSchema>;
export type PlanReportDto = z.infer<typeof planReportSchema>;
export type PlanPeopleQuery = z.infer<typeof planPeopleQuerySchema>;
export type PlanPerson = z.infer<typeof planPersonSchema>;
export type PlanPeopleDto = z.infer<typeof planPeopleSchema>;
export type CreateFeePlanBody = z.infer<typeof createFeePlanBodySchema>;
export type UpdateFeePlanBody = z.infer<typeof updateFeePlanBodySchema>;
export type ListFeePlansQuery = z.infer<typeof listFeePlansQuerySchema>;
export type FeePlanDto = z.infer<typeof feePlanSchema>;
export type GenerateFeesBody = z.infer<typeof generateFeesBodySchema>;
export type GenerateFeesResult = z.infer<typeof generateFeesResultSchema>;
export type CreateFeeBody = z.infer<typeof createFeeBodySchema>;
export type ListFeesQuery = z.infer<typeof listFeesQuerySchema>;
export type FeesSummaryQuery = z.infer<typeof feesSummaryQuerySchema>;
export type PayFeeBody = z.infer<typeof payFeeBodySchema>;
export type FeeDto = z.infer<typeof feeSchema>;
export type FeesSummaryDto = z.infer<typeof feesSummarySchema>;
