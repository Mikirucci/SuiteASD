import { z } from 'zod';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { convocationStatusSchema, eventStatusSchema, eventTypeSchema } from '../../shared/enums.js';
import { convocationSummarySchema } from './summary.js';

const idRef = z.string().min(1).max(64);

export const MAX_CONVOCATIONS_PER_REQUEST = 40;

export const createConvocationsBodySchema = z.object({
  memberIds: z
    .array(idRef)
    .min(1)
    .max(MAX_CONVOCATIONS_PER_REQUEST)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Duplicate member ids' }),
  override: z
    .object({ reason: z.string().trim().min(1).max(300) })
    .optional()
    .describe('ADMIN only: convocate athletes with an expired medical certificate, with a mandatory reason (logged)'),
});

export const respondBodySchema = z
  .object({
    status: z.enum(['CONFIRMED', 'DECLINED']),
    reason: z.string().trim().min(1).max(300).optional().describe('Optional motivation, only when declining'),
  })
  .refine((body) => body.reason === undefined || body.status === 'DECLINED', {
    message: 'A reason is only allowed when declining',
    path: ['reason'],
  });

export const listConvocationsQuerySchema = paginationQuerySchema.extend({
  eventId: idRef.optional(),
  memberId: idRef.optional(),
  status: convocationStatusSchema.optional(),
  upcoming: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .describe('true: only events that have not started yet'),
});

export const convocationSchema = z.object({
  id: z.string(),
  event: z.object({
    id: z.string(),
    type: eventTypeSchema,
    title: z.string(),
    startsAt: isoDateTimeSchema,
    status: eventStatusSchema,
  }),
  member: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    fieldRole: z.string().nullable(),
  }),
  status: convocationStatusSchema,
  sentAt: isoDateTimeSchema.nullable(),
  respondedAt: isoDateTimeSchema.nullable(),
  declineReason: z.string().nullable(),
  overrideReason: z.string().nullable().describe('Set when an ADMIN convocated an ineligible athlete; staff only'),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const eventConvocationsSchema = z.object({
  data: z.array(convocationSchema),
  summary: convocationSummarySchema,
});

export const sendConvocationsResultSchema = z.object({
  eventId: z.string(),
  sent: z.number().int().describe('Convocations sent by this call (0 when everything was already sent)'),
  notified: z.number().int().describe('Notification rows written (per athlete or guardian and channel)'),
  convocationsSentAt: isoDateTimeSchema.nullable(),
});

export const remindConvocationsResultSchema = z.object({
  eventId: z.string(),
  reminded: z.number().int().describe('Pending convocations reminded by this call'),
  notified: z.number().int(),
});

export const eventIdParamsSchema = z.object({ eventId: idRef });

export type CreateConvocationsBody = z.infer<typeof createConvocationsBodySchema>;
export type RespondBody = z.infer<typeof respondBodySchema>;
export type ListConvocationsQuery = z.infer<typeof listConvocationsQuerySchema>;
export type ConvocationDto = z.infer<typeof convocationSchema>;
export type EventConvocationsDto = z.infer<typeof eventConvocationsSchema>;
export type SendConvocationsResult = z.infer<typeof sendConvocationsResultSchema>;
export type RemindConvocationsResult = z.infer<typeof remindConvocationsResultSchema>;
