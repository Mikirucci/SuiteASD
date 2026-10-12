import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { DOCUMENT_STATUSES } from './status.js';

const idRef = z.string().min(1).max(64);
const dateOnly = z.iso.date();

export const documentStatusSchema = z
  .enum(DOCUMENT_STATUSES)
  .describe('OK, EXPIRING (within 30 days), EXPIRED, MISSING (no valid document on file)');

// ---- Document types -------------------------------------------------------------------------------------------

export const createDocumentTypeBodySchema = z.object({
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use 2-40 characters: letters, digits and underscores')
    .describe('Stable machine key, e.g. INSURANCE'),
  name: z.string().trim().min(1).max(80),
  requiresExpiry: z.boolean().default(false).describe('Documents of this type carry an expiry date'),
  isRequired: z.boolean().default(true).describe('Shown as a status indicator on every member'),
  validityDays: z.number().int().min(1).max(3650).optional().describe('Default validity: expiresAt = issuedAt + validityDays'),
});

export const updateDocumentTypeBodySchema = z
  .object({
    name: createDocumentTypeBodySchema.shape.name,
    requiresExpiry: z.boolean(),
    isRequired: z.boolean(),
    validityDays: createDocumentTypeBodySchema.shape.validityDays.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const documentTypeSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  requiresExpiry: z.boolean(),
  isRequired: z.boolean(),
  validityDays: z.number().int().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---- Documents ------------------------------------------------------------------------------------------------

export const createDocumentBodySchema = z.object({
  documentTypeId: idRef,
  title: z.string().trim().min(1).max(120).optional(),
  issuedAt: dateOnly.optional(),
  expiresAt: dateOnly.optional().describe('Required when the type has an expiry unless issuedAt + validityDays apply'),
  notes: z.string().trim().max(1000).optional().describe('Internal notes (secretary only). Never put health data here'),
});

export const updateDocumentBodySchema = z
  .object({
    title: createDocumentBodySchema.shape.title.nullable(),
    issuedAt: dateOnly.nullable(),
    expiresAt: dateOnly.nullable(),
    notes: createDocumentBodySchema.shape.notes.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const documentSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  documentType: z.object({ id: z.string(), key: z.string(), name: z.string(), requiresExpiry: z.boolean() }),
  title: z.string().nullable(),
  issuedAt: dateOnly.nullable(),
  expiresAt: dateOnly.nullable(),
  status: documentStatusSchema,
  daysRemaining: z.number().int().nullable().describe('Days to expiry (negative once expired)'),
  hasFile: z.boolean(),
  fileName: z.string().nullable().describe('Visible only to who may download the file'),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  downloadUrl: z
    .string()
    .nullable()
    .describe('Path of the authorized download endpoint (needs the Bearer token); null when absent or not allowed'),
  notes: z.string().nullable().describe('Visible to the secretary only'),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const uploadQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(200).optional().describe('Original file name (sanitized by the server)'),
});

// ---- Expiry timeline ------------------------------------------------------------------------------------------

export const expirationsQuerySchema = z.object({
  from: dateOnly.optional().describe('First day of the window (default: first day of the current month, UTC)'),
  months: z.coerce.number().int().min(1).max(12).default(6),
  teamId: idRef.optional(),
  documentTypeId: idRef.optional(),
});

export const expirationItemSchema = z.object({
  documentId: z.string(),
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  teams: z.array(z.string()).describe('Names of the current teams'),
  documentType: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  expiresAt: dateOnly,
  daysRemaining: z.number().int(),
  status: z.enum(['OK', 'EXPIRING', 'EXPIRED']),
});

export const expirationsSchema = z.object({
  from: dateOnly,
  to: dateOnly.describe('Last day of the window'),
  months: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), items: z.array(expirationItemSchema) })),
  overdue: z.array(expirationItemSchema).describe('Current documents already expired before the window'),
});

export const indicatorSchema = z.object({
  documentTypeId: z.string(),
  key: z.string(),
  name: z.string(),
  status: documentStatusSchema,
  documentId: z.string().nullable(),
  expiresAt: dateOnly.nullable(),
  daysRemaining: z.number().int().nullable(),
});

export type CreateDocumentTypeBody = z.infer<typeof createDocumentTypeBodySchema>;
export type UpdateDocumentTypeBody = z.infer<typeof updateDocumentTypeBodySchema>;
export type DocumentTypeDto = z.infer<typeof documentTypeSchema>;
export type CreateDocumentBody = z.infer<typeof createDocumentBodySchema>;
export type UpdateDocumentBody = z.infer<typeof updateDocumentBodySchema>;
export type DocumentDto = z.infer<typeof documentSchema>;
export type ExpirationsQuery = z.infer<typeof expirationsQuerySchema>;
export type ExpirationsDto = z.infer<typeof expirationsSchema>;
export type ExpirationItem = z.infer<typeof expirationItemSchema>;
export type DocumentIndicator = z.infer<typeof indicatorSchema>;
