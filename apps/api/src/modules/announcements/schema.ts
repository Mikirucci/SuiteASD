import { z } from 'zod';
import { patchBodySchema } from '../../lib/crud-routes.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';

const idRef = z.string().min(1).max(64);
const titleSchema = z.string().trim().min(1).max(160);
const bodySchema = z.string().trim().min(1).max(5000);

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED'] as const;
export const announcementStatusSchema = z.enum(ANNOUNCEMENT_STATUSES);
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;

export const createAnnouncementBodySchema = z.object({
  title: titleSchema,
  body: bodySchema,
  teamId: idRef.optional().describe('Audience: one team. Omit to address the whole society'),
  isPinned: z.boolean().default(false),
  publishedAt: isoDateTimeSchema
    .nullable()
    .optional()
    .describe('Omitted: published now. null: draft. A future instant: scheduled (visible from then, no notification)'),
});

export const updateAnnouncementBodySchema = patchBodySchema({
  title: titleSchema,
  body: bodySchema,
  teamId: idRef.nullable(),
  isPinned: z.boolean(),
  publishedAt: isoDateTimeSchema.nullable(),
});

export const listAnnouncementsQuerySchema = paginationQuerySchema.extend({
  teamId: idRef.optional(),
  status: announcementStatusSchema.optional(),
});

export const announcementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  teamId: z.string().nullable(),
  teamName: z.string().nullable(),
  isPinned: z.boolean(),
  publishedAt: isoDateTimeSchema.nullable(),
  status: announcementStatusSchema,
  authorId: z.string(),
  authorName: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CreateAnnouncementBody = z.infer<typeof createAnnouncementBodySchema>;
export type UpdateAnnouncementBody = z.infer<typeof updateAnnouncementBodySchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
export type AnnouncementDto = z.infer<typeof announcementSchema>;
