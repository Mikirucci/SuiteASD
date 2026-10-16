import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { guardianRelationSchema } from '../../shared/enums.js';
import { indicatorSchema } from '../documents/schema.js';

const idRef = z.string().min(1).max(64);
const dateOnly = z.iso.date();

export const MEMBER_GENDERS = ['FEMALE', 'MALE'] as const;
export const memberGenderSchema = z.enum(MEMBER_GENDERS);
export const MEMBER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export const overallDocumentStatusSchema = z
  .enum(['OK', 'EXPIRING', 'MISSING'])
  .describe('Worst indicator: MISSING also covers expired documents');

export const fiscalCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{16}$/, 'Expected 16 alphanumeric characters');

// Fields shared by creation, update and CSV import rows.
export const memberFieldsSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthDate: dateOnly.optional(),
  birthPlace: z.string().trim().min(1).max(80).optional(),
  gender: memberGenderSchema.optional(),
  fiscalCode: fiscalCodeSchema.optional(),
  email: z.email().max(254).optional(),
  phone: z.string().trim().min(3).max(30).optional(),
  address: z.string().trim().min(1).max(160).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  postalCode: z.string().trim().min(1).max(10).optional(),
  fieldRole: z.string().trim().min(1).max(40).optional().describe('Role on the court, e.g. Libero'),
  kitSize: z.string().trim().min(1).max(10).optional(),
  status: memberStatusSchema.default('ACTIVE'),
  joinedAt: dateOnly.optional(),
  notes: z.string().trim().min(1).max(1000).optional().describe('Internal notes. Never put health data here'),
});

export const createMemberBodySchema = memberFieldsSchema.extend({
  teamIds: z.array(idRef).max(20).default([]).describe('Teams the member belongs to'),
});

// PATCH: every field optional; `null` clears an optional field; `teamIds` replaces the current teams.
export const updateMemberBodySchema = z
  .object({
    firstName: memberFieldsSchema.shape.firstName,
    lastName: memberFieldsSchema.shape.lastName,
    birthDate: dateOnly.nullable(),
    birthPlace: memberFieldsSchema.shape.birthPlace.nullable(),
    gender: memberGenderSchema.nullable(),
    fiscalCode: fiscalCodeSchema.nullable(),
    email: memberFieldsSchema.shape.email.nullable(),
    phone: memberFieldsSchema.shape.phone.nullable(),
    address: memberFieldsSchema.shape.address.nullable(),
    city: memberFieldsSchema.shape.city.nullable(),
    postalCode: memberFieldsSchema.shape.postalCode.nullable(),
    fieldRole: memberFieldsSchema.shape.fieldRole.nullable(),
    kitSize: memberFieldsSchema.shape.kitSize.nullable(),
    status: memberStatusSchema,
    joinedAt: dateOnly.nullable(),
    notes: memberFieldsSchema.shape.notes.nullable(),
    teamIds: z.array(idRef).max(20),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

// What an athlete or a guardian may change on their own member: contact details and the kit size. Identity data,
// teams, role on the court and status stay with the secretary.
export const updateOwnContactBodySchema = z
  .object({
    email: memberFieldsSchema.shape.email.nullable(),
    phone: memberFieldsSchema.shape.phone.nullable(),
    address: memberFieldsSchema.shape.address.nullable(),
    city: memberFieldsSchema.shape.city.nullable(),
    postalCode: memberFieldsSchema.shape.postalCode.nullable(),
    kitSize: memberFieldsSchema.shape.kitSize.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

// A guardian adds a child: the child becomes a member with no team (the secretary assigns it) and a guardian link.
export const createChildBodySchema = z.object({
  firstName: memberFieldsSchema.shape.firstName,
  lastName: memberFieldsSchema.shape.lastName,
  birthDate: dateOnly,
  birthPlace: memberFieldsSchema.shape.birthPlace,
  gender: memberGenderSchema.optional(),
  fiscalCode: fiscalCodeSchema.optional(),
  fieldRole: memberFieldsSchema.shape.fieldRole,
  relation: guardianRelationSchema.default('ALTRO'),
});

export const listMembersQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional().describe('Words matched against name, fiscal code and email'),
  teamId: idRef.optional(),
  noTeam: z.stringbool().optional().describe("true: only members who belong to no team yet (ignored when teamId is set)"),
  documentStatus: overallDocumentStatusSchema.optional(),
  status: memberStatusSchema.optional(),
  gender: memberGenderSchema.optional(),
  fieldRole: z.string().trim().min(1).max(40).optional().describe("Role on the court, case-insensitive match"),
  birthYear: z.coerce.number().int().min(1900).max(2100).optional().describe("Year of birth"),
});

export const exportMembersQuerySchema = listMembersQuerySchema;

const teamRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  position: z.string().nullable(),
  jerseyNumber: z.number().int().nullable(),
});

export const memberListItemSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: dateOnly.nullable(),
  birthPlace: z.string().nullable(),
  gender: memberGenderSchema.nullable(),
  fiscalCode: z.string().nullable().describe('Hidden from coaches and staff'),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable().describe('Hidden from coaches and staff'),
  city: z.string().nullable(),
  postalCode: z.string().nullable().describe('Hidden from coaches and staff'),
  fieldRole: z.string().nullable(),
  kitSize: z.string().nullable(),
  status: memberStatusSchema,
  joinedAt: dateOnly.nullable(),
  notes: z.string().nullable().describe('Hidden from coaches and staff'),
  teams: z.array(teamRefSchema),
  documents: z.array(indicatorSchema).describe('One status indicator per required document type'),
  documentStatus: overallDocumentStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const memberDetailSchema = memberListItemSchema.extend({
  guardians: z.array(
    z.object({
      linkId: z.string(),
      userId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      relation: guardianRelationSchema,
    }),
  ),
});

export const memberSummarySchema = z.object({
  tesserati: z.number().int().describe('Active members'),
  squadre: z.number().int().describe('Teams'),
  documentiMancanti: z.number().int().describe('Required documents missing or expired, across active members'),
});

// ---- CSV import -----------------------------------------------------------------------------------------------

export const MAX_IMPORT_ROWS = 1000;

export const importMembersBodySchema = z.object({
  csv: z.string().min(1).max(900_000).describe('CSV text with a header row (";" or "," separated)'),
  dryRun: z
    .boolean()
    .default(true)
    .describe('Validate and report only (default). Send false to create the valid rows'),
});

export const importMembersResultSchema = z.object({
  dryRun: z.boolean(),
  totalRows: z.number().int(),
  validRows: z.number().int(),
  invalidRows: z.number().int(),
  created: z.number().int().describe('Always 0 on a dry run'),
  ignoredColumns: z.array(z.string()),
  errors: z.array(
    z.object({
      row: z.number().int().describe('1-based record number counting the header as record 1'),
      field: z.string().nullable(),
      message: z.string(),
    }),
  ),
});

export type CreateMemberBody = z.infer<typeof createMemberBodySchema>;
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>;
export type UpdateOwnContactBody = z.infer<typeof updateOwnContactBodySchema>;
export type CreateChildBody = z.infer<typeof createChildBodySchema>;
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
export type ExportMembersQuery = z.infer<typeof exportMembersQuerySchema>;
export type MemberListItem = z.infer<typeof memberListItemSchema>;
export type MemberDetail = z.infer<typeof memberDetailSchema>;
export type MemberSummary = z.infer<typeof memberSummarySchema>;
export type ImportMembersBody = z.infer<typeof importMembersBodySchema>;
export type ImportMembersResult = z.infer<typeof importMembersResultSchema>;
