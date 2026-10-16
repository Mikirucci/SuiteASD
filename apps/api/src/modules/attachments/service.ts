import type { Attachment } from '@prisma/client';
import type { Readable } from 'node:stream';
import { forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { attachmentEntityTypeSchema, type AttachmentEntityType } from '../../shared/enums.js';
import type { AllowedMimeType, FileStorage } from '../documents/storage.js';
import { matchesSignature, sanitizeFileName } from '../documents/storage.js';
import { canManageAttachments, entityExists } from './entities.js';
import type { AttachmentDto, ListAttachmentsQuery, UploadAttachmentQuery } from './schema.js';

export const ATTACHMENT_DOWNLOAD_PATH = (attachmentId: string): string => `/api/v1/attachments/${attachmentId}/file`;

// A record cannot keep an unbounded amount of files: enough for contracts, invoices and photos.
export const MAX_ATTACHMENTS_PER_ENTITY = 20;

function toDto(row: Attachment): AttachmentDto {
  return {
    id: row.id,
    entityType: attachmentEntityTypeSchema.parse(row.entityType),
    entityId: row.entityId,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    downloadUrl: ATTACHMENT_DOWNLOAD_PATH(row.id),
    createdAt: toIso(row.createdAt),
  };
}

// The caller must manage the kind of record, and the record must exist in their society.
async function assertAccess(ctx: TenantRequestContext, entityType: AttachmentEntityType, entityId: string): Promise<void> {
  if (!canManageAttachments(ctx.auth.roles, entityType)) throw forbidden();
  if (!(await entityExists(ctx.db, entityType, entityId))) throw notFound('Record');
}

export async function listAttachments(ctx: TenantRequestContext, query: ListAttachmentsQuery): Promise<AttachmentDto[]> {
  await assertAccess(ctx, query.entityType, query.entityId);
  const rows = await ctx.db.attachment.findMany({
    where: { entityType: query.entityType, entityId: query.entityId },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return rows.map(toDto);
}

export interface UploadedFile {
  content: Buffer;
  mimeType: AllowedMimeType;
}

export async function createAttachment(
  ctx: TenantRequestContext,
  query: UploadAttachmentQuery,
  file: UploadedFile,
  storage: FileStorage,
): Promise<AttachmentDto> {
  await assertAccess(ctx, query.entityType, query.entityId);
  if (file.content.length === 0) throw unprocessable('empty_file', 'The uploaded file is empty');
  if (!matchesSignature(file.content, file.mimeType)) {
    throw unprocessable('file_content_mismatch', 'The file content does not match its declared type');
  }
  const existing = await ctx.db.attachment.count({ where: { entityType: query.entityType, entityId: query.entityId } });
  if (existing >= MAX_ATTACHMENTS_PER_ENTITY) {
    throw unprocessable('too_many_attachments', `At most ${MAX_ATTACHMENTS_PER_ENTITY} files can be attached to one record`);
  }

  const fileKey = await storage.save(ctx.auth.societyId, file.content, file.mimeType);
  try {
    const row = await ctx.db.attachment.create({
      data: {
        societyId: ctx.auth.societyId,
        entityType: query.entityType,
        entityId: query.entityId,
        title: query.title ?? null,
        fileKey,
        fileName: sanitizeFileName(query.fileName, 'allegato'),
        mimeType: file.mimeType,
        sizeBytes: file.content.length,
        uploadedById: ctx.auth.userId,
      },
    });
    return toDto(row);
  } catch (error) {
    await storage.remove(fileKey);
    throw error;
  }
}

export interface OpenedAttachment {
  stream: Readable;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

export async function openAttachment(ctx: TenantRequestContext, id: string, storage: FileStorage): Promise<OpenedAttachment> {
  const row = await ctx.db.attachment.findFirst({ where: { id } });
  if (!row) throw notFound('Attachment');
  await assertAccess(ctx, attachmentEntityTypeSchema.parse(row.entityType), row.entityId);
  try {
    const { stream, sizeBytes } = await storage.open(row.fileKey);
    return { stream, mimeType: row.mimeType, fileName: sanitizeFileName(row.fileName, 'allegato'), sizeBytes };
  } catch {
    throw notFound('Attachment file');
  }
}

export async function deleteAttachment(ctx: TenantRequestContext, id: string, storage: FileStorage): Promise<void> {
  const row = await ctx.db.attachment.findFirst({ where: { id } });
  if (!row) throw notFound('Attachment');
  await assertAccess(ctx, attachmentEntityTypeSchema.parse(row.entityType), row.entityId);
  await ctx.db.attachment.deleteMany({ where: { id } });
  await storage.remove(row.fileKey);
}

// Called when a record is deleted: its files go with it.
export async function purgeAttachmentsOf(
  ctx: TenantRequestContext,
  entityType: AttachmentEntityType,
  entityId: string,
  storage: FileStorage,
): Promise<void> {
  const rows = await ctx.db.attachment.findMany({ where: { entityType, entityId } });
  if (rows.length === 0) return;
  await ctx.db.attachment.deleteMany({ where: { entityType, entityId } });
  await Promise.all(rows.map((row) => storage.remove(row.fileKey)));
}
