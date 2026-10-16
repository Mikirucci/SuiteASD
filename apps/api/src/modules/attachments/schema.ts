import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { attachmentEntityTypeSchema } from '../../shared/enums.js';

const idRef = z.string().min(1).max(64);

export const listAttachmentsQuerySchema = z.object({
  entityType: attachmentEntityTypeSchema,
  entityId: idRef,
});

export const uploadAttachmentQuerySchema = listAttachmentsQuerySchema.extend({
  fileName: z.string().trim().min(1).max(200).optional().describe('Original file name (sanitized by the server)'),
  title: z.string().trim().min(1).max(120).optional().describe('What the document is, e.g. "Contratto di affitto 2026"'),
});

export const attachmentSchema = z.object({
  id: z.string(),
  entityType: attachmentEntityTypeSchema,
  entityId: z.string(),
  title: z.string().nullable(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  downloadUrl: z.string().describe('Path of the authorized download endpoint, prefixed with /api/v1'),
  createdAt: isoDateTimeSchema,
});

export const attachmentListSchema = z.object({ data: z.array(attachmentSchema) });

export type ListAttachmentsQuery = z.infer<typeof listAttachmentsQuerySchema>;
export type UploadAttachmentQuery = z.infer<typeof uploadAttachmentQuerySchema>;
export type AttachmentDto = z.infer<typeof attachmentSchema>;
