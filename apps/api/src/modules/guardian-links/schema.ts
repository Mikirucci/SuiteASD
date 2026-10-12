import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { guardianRelationSchema } from '../../shared/enums.js';

export const createGuardianLinkBodySchema = z.object({
  guardianUserId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64),
  relation: guardianRelationSchema.default('ALTRO'),
});

export const listGuardianLinksQuerySchema = z.object({
  memberId: z.string().min(1).max(64).optional(),
  guardianUserId: z.string().min(1).max(64).optional(),
});

export const guardianLinkSchema = z.object({
  id: z.string(),
  guardianUserId: z.string(),
  memberId: z.string(),
  relation: guardianRelationSchema,
  createdAt: isoDateTimeSchema,
});

export type CreateGuardianLinkBody = z.infer<typeof createGuardianLinkBodySchema>;
export type ListGuardianLinksQuery = z.infer<typeof listGuardianLinksQuerySchema>;
export type GuardianLinkDto = z.infer<typeof guardianLinkSchema>;
