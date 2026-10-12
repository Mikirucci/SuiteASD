import { z } from 'zod';
import { patchBodySchema } from '../../lib/crud-routes.js';
import { dateOnlySchema } from '../../lib/date-only.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { emailSchema, isoDateTimeSchema } from '../../lib/schemas.js';
import { sponsorStatusSchema } from '../../shared/enums.js';

const amountCentsSchema = z.number().int().min(0).max(1_000_000_000).describe('Contract amount in euro cents');

export const createSponsorBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    contactName: z.string().trim().min(1).max(120).optional(),
    email: emailSchema.optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    amountCents: amountCentsSchema.default(0),
    contractStart: dateOnlySchema.optional(),
    contractEnd: dateOnlySchema.optional(),
    status: sponsorStatusSchema.default('ACTIVE'),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((body) => !body.contractStart || !body.contractEnd || body.contractEnd >= body.contractStart, {
    message: 'contractEnd must not be before contractStart',
    path: ['contractEnd'],
  });

export const updateSponsorBodySchema = patchBodySchema({
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().min(1).max(120).nullable(),
  email: emailSchema.nullable(),
  phone: z.string().trim().min(3).max(40).nullable(),
  amountCents: amountCentsSchema,
  contractStart: dateOnlySchema.nullable(),
  contractEnd: dateOnlySchema.nullable(),
  status: sponsorStatusSchema,
  notes: z.string().trim().min(1).max(1000).nullable(),
}).refine((body) => !body.contractStart || !body.contractEnd || body.contractEnd >= body.contractStart, {
  message: 'contractEnd must not be before contractStart',
  path: ['contractEnd'],
});

export const listSponsorsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(80).optional().describe('Substring of the sponsor name'),
  status: sponsorStatusSchema.optional(),
  expiresBefore: dateOnlySchema.optional().describe('Only contracts ending on or before this day'),
});

export const sponsorSchema = z.object({
  id: z.string(),
  name: z.string(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  amountCents: z.number().int(),
  contractStart: dateOnlySchema.nullable(),
  contractEnd: dateOnlySchema.nullable(),
  status: sponsorStatusSchema,
  notes: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CreateSponsorBody = z.infer<typeof createSponsorBodySchema>;
export type UpdateSponsorBody = z.infer<typeof updateSponsorBodySchema>;
export type ListSponsorsQuery = z.infer<typeof listSponsorsQuerySchema>;
export type SponsorDto = z.infer<typeof sponsorSchema>;
