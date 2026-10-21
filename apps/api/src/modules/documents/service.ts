import type { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantDb } from '../../lib/tenant.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { can } from '../../rbac/permissions.js';
import { memberScope, ownMemberIds } from '../members/access.js';
import { notifyAdministration } from '../notifications/admin-alerts.js';
import type {
  CreateDocumentBody,
  CreateDocumentTypeBody,
  DocumentDto,
  DocumentTypeDto,
  ExpirationItem,
  ExpirationsDto,
  ExpirationsQuery,
  UpdateDocumentBody,
  UpdateDocumentTypeBody,
  UploadDocumentQuery,
} from './schema.js';
import {
  MEDICAL_CERTIFICATE_KEY,
  addDays,
  daysUntil,
  formatDateOnly,
  parseDateOnly,
  startOfUtcDay,
  statusForExpiry,
  statusOfDocument,
} from './status.js';
import type { AllowedMimeType, FileStorage } from './storage.js';
import { matchesSignature, sanitizeFileName } from './storage.js';
import type { Readable } from 'node:stream';

export const DOCUMENT_DOWNLOAD_PATH = (documentId: string): string => `/api/v1/documents/${documentId}/file`;

// ---------------------------------------------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------------------------------------------

type DocumentTypeRow = Prisma.DocumentTypeGetPayload<object>;

function toTypeDto(type: DocumentTypeRow): DocumentTypeDto {
  return {
    id: type.id,
    key: type.key,
    name: type.name,
    requiresExpiry: type.requiresExpiry,
    isRequired: type.isRequired,
    validityDays: type.validityDays,
    createdAt: toIso(type.createdAt),
    updatedAt: toIso(type.updatedAt),
  };
}

export async function listDocumentTypes({ db }: TenantRequestContext, query: PaginationQuery): Promise<Page<DocumentTypeDto>> {
  const rows = await db.documentType.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toTypeDto), page: page.page };
}

export async function createDocumentType(ctx: TenantRequestContext, body: CreateDocumentTypeBody): Promise<DocumentTypeDto> {
  try {
    const type = await ctx.db.documentType.create({ data: { ...body, societyId: ctx.auth.societyId } });
    return toTypeDto(type);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('document_type_key_taken', `A document type "${body.key}" already exists`);
    throw error;
  }
}

export async function updateDocumentType(
  { db }: TenantRequestContext,
  id: string,
  body: UpdateDocumentTypeBody,
): Promise<DocumentTypeDto> {
  // Disabling the expiry of the medical certificate would silently switch off the "expired => not convocable" rule.
  if (body.requiresExpiry === false) {
    const type = await db.documentType.findFirst({ where: { id }, select: { key: true } });
    if (type?.key === MEDICAL_CERTIFICATE_KEY) {
      throw conflict('document_type_protected', 'The medical certificate must keep its expiry date');
    }
  }
  // A missing / foreign-tenant id makes Prisma throw P2025, mapped to 404 by the error plugin.
  return toTypeDto(await db.documentType.update({ where: { id }, data: body }));
}

export async function deleteDocumentType({ db }: TenantRequestContext, id: string): Promise<void> {
  const type = await db.documentType.findFirst({ where: { id }, select: { key: true } });
  if (!type) throw notFound('Document type');
  if (type.key === MEDICAL_CERTIFICATE_KEY) {
    throw conflict('document_type_protected', 'The medical certificate type cannot be deleted');
  }
  if ((await db.document.count({ where: { documentTypeId: id } })) > 0) {
    throw conflict('document_type_in_use', 'Documents of this type exist: delete them first');
  }
  await db.documentType.deleteMany({ where: { id } });
}

// ---------------------------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------------------------

type DocumentRow = Prisma.DocumentGetPayload<{ include: { documentType: true } }>;

interface Viewer {
  isWriter: boolean;
  // Members whose files this viewer may download besides being a writer (athlete: self, guardian: children).
  ownMemberIds: ReadonlySet<string>;
}

async function viewerOf(ctx: TenantRequestContext): Promise<Viewer> {
  const isWriter = can(ctx.auth.roles, 'documents:write');
  return { isWriter, ownMemberIds: isWriter ? new Set() : await ownMemberIds(ctx) };
}

const canDownload = (viewer: Viewer, memberId: string): boolean => viewer.isWriter || viewer.ownMemberIds.has(memberId);

function toDto(document: DocumentRow, viewer: Viewer, now: Date): DocumentDto {
  const { documentType } = document;
  const download = canDownload(viewer, document.memberId);
  const hasFile = document.fileKey !== null;
  const expiresAt = documentType.requiresExpiry ? document.expiresAt : null;
  return {
    id: document.id,
    memberId: document.memberId,
    documentType: {
      id: documentType.id,
      key: documentType.key,
      name: documentType.name,
      requiresExpiry: documentType.requiresExpiry,
    },
    title: document.title,
    issuedAt: document.issuedAt ? formatDateOnly(document.issuedAt) : null,
    expiresAt: document.expiresAt ? formatDateOnly(document.expiresAt) : null,
    status: statusOfDocument(document, documentType.requiresExpiry, now),
    daysRemaining: expiresAt ? daysUntil(expiresAt, now) : null,
    hasFile,
    fileName: download ? document.fileName : null,
    mimeType: download ? document.mimeType : null,
    sizeBytes: download ? document.sizeBytes : null,
    downloadUrl: hasFile && download ? DOCUMENT_DOWNLOAD_PATH(document.id) : null,
    notes: viewer.isWriter ? document.notes : null,
    createdAt: toIso(document.createdAt),
    updatedAt: toIso(document.updatedAt),
  };
}

function readScope(ctx: TenantRequestContext): Prisma.DocumentWhereInput {
  return { member: memberScope(ctx, 'documents:read') };
}

// expiresAt rules: a type with expiry needs a date (given, or issuedAt + validityDays); other types must not carry one.
function resolveExpiry(
  type: Pick<DocumentTypeRow, 'requiresExpiry' | 'validityDays'>,
  issuedAt: Date | null,
  expiresAt: Date | null,
  deriveFromValidity: boolean,
): Date | null {
  if (!type.requiresExpiry) {
    if (expiresAt) {
      throw unprocessable('expiry_not_applicable', 'This document type has no expiry date', [
        { path: 'expiresAt', message: 'Not allowed for this document type' },
      ]);
    }
    return null;
  }
  const resolved =
    expiresAt ?? (deriveFromValidity && issuedAt && type.validityDays ? addDays(issuedAt, type.validityDays) : null);
  if (!resolved) {
    throw unprocessable('expiry_required', 'This document type requires an expiry date', [
      { path: 'expiresAt', message: 'Required for this document type' },
    ]);
  }
  if (issuedAt && resolved < issuedAt) {
    throw unprocessable('invalid_dates', 'The expiry date precedes the issue date', [
      { path: 'expiresAt', message: 'Must not precede issuedAt' },
    ]);
  }
  return resolved;
}

const optionalDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined || value === null ? value : parseDateOnly(value);

export async function listMemberDocuments(
  ctx: TenantRequestContext,
  memberId: string,
  query: PaginationQuery,
  now = new Date(),
): Promise<Page<DocumentDto>> {
  const member = await ctx.db.member.findFirst({ where: { id: memberId, ...memberScope(ctx, 'documents:read') }, select: { id: true } });
  if (!member) throw notFound('Member');
  const rows = await ctx.db.document.findMany({
    where: { memberId },
    include: { documentType: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const viewer = await viewerOf(ctx);
  const page = toPage(rows, query);
  return { data: page.data.map((row) => toDto(row, viewer, now)), page: page.page };
}

export async function getDocument(ctx: TenantRequestContext, id: string, now = new Date()): Promise<DocumentDto> {
  const row = await ctx.db.document.findFirst({ where: { id, ...readScope(ctx) }, include: { documentType: true } });
  if (!row) throw notFound('Document');
  return toDto(row, await viewerOf(ctx), now);
}

export async function createDocument(
  ctx: TenantRequestContext,
  memberId: string,
  body: CreateDocumentBody,
  now = new Date(),
): Promise<DocumentDto> {
  const { db, auth } = ctx;
  if (!(await db.member.findFirst({ where: { id: memberId }, select: { id: true } }))) throw notFound('Member');
  const type = await db.documentType.findFirst({ where: { id: body.documentTypeId } });
  if (!type) throw notFound('Document type');
  const issuedAt = optionalDate(body.issuedAt) ?? null;
  const expiresAt = resolveExpiry(type, issuedAt, optionalDate(body.expiresAt) ?? null, true);
  const created = await db.document.create({
    data: {
      societyId: auth.societyId,
      memberId,
      documentTypeId: type.id,
      title: body.title ?? null,
      issuedAt,
      expiresAt,
      notes: body.notes ?? null,
      uploadedById: auth.userId,
    },
    include: { documentType: true },
  });
  return toDto(created, await viewerOf(ctx), now);
}

export async function updateDocument(
  ctx: TenantRequestContext,
  id: string,
  body: UpdateDocumentBody,
  now = new Date(),
): Promise<DocumentDto> {
  const existing = await ctx.db.document.findFirst({ where: { id }, include: { documentType: true } });
  if (!existing) throw notFound('Document');
  const issuedAt = body.issuedAt === undefined ? existing.issuedAt : optionalDate(body.issuedAt);
  const expiresAt = resolveExpiry(
    existing.documentType,
    issuedAt ?? null,
    body.expiresAt === undefined ? existing.expiresAt : (optionalDate(body.expiresAt) ?? null),
    false,
  );
  const updated = await ctx.db.document.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      issuedAt: issuedAt ?? null,
      expiresAt,
    },
    include: { documentType: true },
  });
  return toDto(updated, await viewerOf(ctx), now);
}

export async function deleteDocument({ db }: TenantRequestContext, id: string, storage: FileStorage): Promise<void> {
  const existing = await db.document.findFirst({ where: { id }, select: { fileKey: true } });
  if (!existing) throw notFound('Document');
  await db.document.deleteMany({ where: { id } });
  if (existing.fileKey) await storage.remove(existing.fileKey);
}

// ---------------------------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------------------------

export interface UploadedFile {
  content: Buffer;
  mimeType: AllowedMimeType;
  fileName: string | undefined;
}

export async function uploadDocumentFile(
  ctx: TenantRequestContext,
  id: string,
  file: UploadedFile,
  storage: FileStorage,
  now = new Date(),
): Promise<DocumentDto> {
  const existing = await ctx.db.document.findFirst({ where: { id }, select: { fileKey: true } });
  if (!existing) throw notFound('Document');
  if (file.content.length === 0) throw unprocessable('empty_file', 'The uploaded file is empty');
  if (!matchesSignature(file.content, file.mimeType)) {
    throw unprocessable('file_content_mismatch', 'The file content does not match its declared type');
  }

  const fileKey = await storage.save(ctx.auth.societyId, file.content, file.mimeType);
  try {
    const updated = await ctx.db.document.update({
      where: { id },
      data: {
        fileKey,
        fileName: sanitizeFileName(file.fileName),
        mimeType: file.mimeType,
        sizeBytes: file.content.length,
        uploadedById: ctx.auth.userId,
      },
      include: { documentType: true },
    });
    if (existing.fileKey) await storage.remove(existing.fileKey);
    return toDto(updated, await viewerOf(ctx), now);
  } catch (error) {
    await storage.remove(fileKey);
    throw error;
  }
}

export interface UploadedDocument {
  document: DocumentDto;
  memberName: string;
  // True when an athlete or guardian uploaded it themselves (the administration is then told).
  selfService: boolean;
}

// One request, one document: the record and its file are created together, so there is never a record without its
// file. The secretary may do it for any member; an athlete or a guardian only for their own members ("area
// personale"), which is what keeps the administration's view up to date by itself: the status of the member's
// documents is computed from what is on file, so the upload shows up in the lists and the expiry timeline at once.
export async function uploadMemberDocument(
  ctx: TenantRequestContext,
  memberId: string,
  query: UploadDocumentQuery,
  file: { content: Buffer; mimeType: AllowedMimeType },
  storage: FileStorage,
  now = new Date(),
): Promise<UploadedDocument> {
  const { db, auth } = ctx;
  const viewer = await viewerOf(ctx);
  if (!viewer.isWriter) {
    if (!can(auth.roles, 'documents:uploadOwn')) throw forbidden();
    // Somebody else's member looks like a missing one.
    if (!viewer.ownMemberIds.has(memberId)) throw notFound('Member');
  }
  const member = await db.member.findFirst({ where: { id: memberId }, select: { firstName: true, lastName: true } });
  if (!member) throw notFound('Member');
  const type = await db.documentType.findFirst({ where: { id: query.documentTypeId } });
  if (!type) throw notFound('Document type');
  if (file.content.length === 0) throw unprocessable('empty_file', 'The uploaded file is empty');
  if (!matchesSignature(file.content, file.mimeType)) {
    throw unprocessable('file_content_mismatch', 'The file content does not match its declared type');
  }
  const issuedAt = optionalDate(query.issuedAt) ?? null;
  const expiresAt = resolveExpiry(type, issuedAt, optionalDate(query.expiresAt) ?? null, true);

  const fileKey = await storage.save(auth.societyId, file.content, file.mimeType);
  try {
    const created = await db.document.create({
      data: {
        societyId: auth.societyId,
        memberId,
        documentTypeId: type.id,
        title: query.title ?? null,
        issuedAt,
        expiresAt,
        fileKey,
        fileName: sanitizeFileName(query.fileName),
        mimeType: file.mimeType,
        sizeBytes: file.content.length,
        uploadedById: auth.userId,
      },
      include: { documentType: true },
    });
    return {
      document: toDto(created, viewer, now),
      memberName: `${member.firstName} ${member.lastName}`,
      selfService: !viewer.isWriter,
    };
  } catch (error) {
    await storage.remove(fileKey);
    throw error;
  }
}

// Tells the administration that an athlete or guardian uploaded a document. Best effort: a failure here must not
// undo an upload that went through.
export async function alertDocumentUploaded(ctx: TenantRequestContext, uploaded: UploadedDocument, log: FastifyBaseLogger): Promise<void> {
  if (!uploaded.selfService) return;
  const { document } = uploaded;
  try {
    await notifyAdministration(ctx.db, {
      societyId: ctx.auth.societyId,
      template: {
        type: 'ADMIN_DOCUMENT_UPLOADED',
        memberName: uploaded.memberName,
        documentName: document.documentType.name,
        expiresAt: document.expiresAt ? parseDateOnly(document.expiresAt) : null,
      },
      dedupeKey: `document-uploaded:${document.id}`,
      data: { memberId: document.memberId, documentId: document.id },
      exceptUserId: ctx.auth.userId,
      now: new Date(),
    });
  } catch (error) {
    log.error({ err: error, documentId: document.id }, 'could not notify the administration of an uploaded document');
  }
}

// Access log entry for sensitive files. It deliberately carries ids only: no names, no file name, nothing medical.
export interface DocumentAccessEntry {
  event: 'document.download';
  outcome: 'granted' | 'denied';
  documentId: string;
  memberId: string;
  userId: string;
  societyId: string;
}

export interface OpenedFile {
  stream: Readable;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

// Medical certificates of minors are sensitive: only the secretary (documents:write) and the member's own
// athlete / guardian may read the file. Coaches and staff see the status only. Every attempt is logged.
export async function openDocumentFile(
  ctx: TenantRequestContext,
  id: string,
  storage: FileStorage,
  audit: (entry: DocumentAccessEntry) => void,
): Promise<OpenedFile> {
  const document = await ctx.db.document.findFirst({ where: { id, ...readScope(ctx) } });
  if (!document?.fileKey || !document.mimeType) throw notFound('Document file');

  const viewer = await viewerOf(ctx);
  const entry = { event: 'document.download', documentId: document.id, memberId: document.memberId, userId: ctx.auth.userId, societyId: ctx.auth.societyId } as const;
  if (!canDownload(viewer, document.memberId)) {
    audit({ ...entry, outcome: 'denied' });
    throw forbidden();
  }
  audit({ ...entry, outcome: 'granted' });

  try {
    const { stream, sizeBytes } = await storage.open(document.fileKey);
    return { stream, mimeType: document.mimeType, fileName: sanitizeFileName(document.fileName ?? undefined), sizeBytes };
  } catch {
    throw notFound('Document file');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Expiry timeline (SPEC 02)
// ---------------------------------------------------------------------------------------------------------------

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

const addMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

export async function listExpirations(ctx: TenantRequestContext, query: ExpirationsQuery, now = new Date()): Promise<ExpirationsDto> {
  const from = query.from ? parseDateOnly(query.from) : addMonths(now, 0);
  const firstMonth = addMonths(from, 0);
  const to = addDays(addMonths(firstMonth, query.months), -1);

  const rows = await ctx.db.document.findMany({
    where: {
      expiresAt: { not: null },
      documentType: { requiresExpiry: true, ...(query.documentTypeId ? { id: query.documentTypeId } : {}) },
      member: {
        AND: [
          memberScope(ctx, 'documents:read'),
          { status: 'ACTIVE' },
          query.teamId ? { teamMemberships: { some: { teamId: query.teamId, leftAt: null } } } : {},
        ],
      },
    },
    include: {
      documentType: { select: { id: true, key: true, name: true } },
      member: {
        select: {
          firstName: true,
          lastName: true,
          teamMemberships: { where: { leftAt: null }, select: { team: { select: { name: true } } } },
        },
      },
    },
  });

  // Only the document valid the longest per (member, type) counts: a renewed certificate replaces the old one.
  const current = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.memberId}:${row.documentTypeId}`;
    const known = current.get(key);
    if (!known?.expiresAt || (row.expiresAt && row.expiresAt > known.expiresAt)) current.set(key, row);
  }

  const items: ExpirationItem[] = [];
  for (const row of current.values()) {
    if (!row.expiresAt) continue;
    items.push({
      documentId: row.id,
      memberId: row.memberId,
      firstName: row.member.firstName,
      lastName: row.member.lastName,
      teams: row.member.teamMemberships.map((membership) => membership.team.name).sort(),
      documentType: row.documentType,
      expiresAt: formatDateOnly(row.expiresAt),
      daysRemaining: daysUntil(row.expiresAt, now),
      status: statusForExpiry(row.expiresAt, now),
    });
  }
  items.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.lastName.localeCompare(b.lastName) || a.memberId.localeCompare(b.memberId));

  const fromDate = formatDateOnly(from);
  const toDate = formatDateOnly(to);
  const months = Array.from({ length: query.months }, (_, index) => ({
    month: monthKey(addMonths(firstMonth, index)),
    items: [] as ExpirationItem[],
  }));
  const overdue: ExpirationItem[] = [];
  for (const item of items) {
    if (item.expiresAt < fromDate) {
      if (item.status === 'EXPIRED') overdue.push(item);
    } else if (item.expiresAt <= toDate) {
      months.find((bucket) => bucket.month === item.expiresAt.slice(0, 7))?.items.push(item);
    }
  }
  return { from: fromDate, to: toDate, months, overdue };
}

// ---------------------------------------------------------------------------------------------------------------
// Eligibility (SPEC 02: "un atleta con certificato scaduto non e' convocabile")
// ---------------------------------------------------------------------------------------------------------------

// Members (among `memberIds`) whose current medical certificate has expired. A member without any certificate
// is flagged by the document indicators but is not blocked here (SPEC only blocks the EXPIRED certificate).
export async function ineligibleMemberIds(
  { db }: { db: Pick<TenantDb, 'document'> },
  memberIds: readonly string[],
  now = new Date(),
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  const certificates = await db.document.findMany({
    where: {
      memberId: { in: [...memberIds] },
      expiresAt: { not: null },
      documentType: { key: MEDICAL_CERTIFICATE_KEY },
    },
    select: { memberId: true, expiresAt: true },
  });
  const latest = new Map<string, Date>();
  for (const { memberId, expiresAt } of certificates) {
    if (expiresAt && (latest.get(memberId) ?? new Date(0)) < expiresAt) latest.set(memberId, expiresAt);
  }
  const today = startOfUtcDay(now);
  return new Set([...latest].filter(([, expiresAt]) => expiresAt < today).map(([memberId]) => memberId));
}

// Reusable by the convocations module: `await isMemberEligible(tenantOf(request), memberId)`.
// Throws 404 when the member does not exist in the caller's society.
export async function isMemberEligible(
  ctx: Pick<TenantRequestContext, 'db'>,
  memberId: string,
  now = new Date(),
): Promise<boolean> {
  if (!(await ctx.db.member.findFirst({ where: { id: memberId }, select: { id: true } }))) throw notFound('Member');
  return !(await ineligibleMemberIds(ctx, [memberId], now)).has(memberId);
}
