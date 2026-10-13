import { z } from 'zod';
import { patchBodySchema } from '../../lib/crud-routes.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { emailSchema, isoDateTimeSchema } from '../../lib/schemas.js';

const idRef = z.string().min(1).max(64);
const feeCentsSchema = z.number().int().min(0).max(100_000_000).describe('Fee / expense refund in euro cents');
const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

// ---- referees ----------------------------------------------------------------------------------------------

export const createRefereeBodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema.optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  qualification: z.string().trim().min(1).max(200).optional().describe('e.g. "Arbitro regionale"'),
  notes: z.string().trim().min(1).max(1000).optional(),
});

export const updateRefereeBodySchema = patchBodySchema({
  firstName: createRefereeBodySchema.shape.firstName,
  lastName: createRefereeBodySchema.shape.lastName,
  email: emailSchema.nullable(),
  phone: createRefereeBodySchema.shape.phone.nullable(),
  qualification: createRefereeBodySchema.shape.qualification.nullable(),
  notes: createRefereeBodySchema.shape.notes.nullable(),
});

export const listRefereesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(80).optional().describe('Substring of first or last name'),
});

export const refereeSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  qualification: z.string().nullable(),
  notes: z.string().nullable(),
  assignmentsCount: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---- assignments (designazioni) ----------------------------------------------------------------------------

export const createAssignmentBodySchema = z.object({
  refereeId: idRef,
  matchId: idRef,
  feeCents: feeCentsSchema.optional(),
});

export const updateAssignmentBodySchema = patchBodySchema({
  feeCents: feeCentsSchema.nullable(),
  reimbursedAt: isoDateTimeSchema.nullable().describe('When the fee was paid to the referee; null = still to reimburse'),
});

export const listAssignmentsQuerySchema = paginationQuerySchema.extend({
  refereeId: idRef.optional(),
  matchId: idRef.optional(),
  reimbursed: queryBoolean.optional().describe('true: already reimbursed; false: still to reimburse'),
});

export const assignmentSchema = z.object({
  id: z.string(),
  refereeId: z.string(),
  refereeName: z.string(),
  matchId: z.string(),
  match: z.object({
    homeTeam: z.string(),
    awayTeam: z.string(),
    round: z.number().int().nullable(),
    groupName: z.string(),
    competitionName: z.string(),
    date: isoDateTimeSchema.nullable().describe('Kick-off of the linked calendar event, else the date it was played'),
  }),
  feeCents: z.number().int().nullable(),
  reimbursedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CreateRefereeBody = z.infer<typeof createRefereeBodySchema>;
export type UpdateRefereeBody = z.infer<typeof updateRefereeBodySchema>;
export type ListRefereesQuery = z.infer<typeof listRefereesQuerySchema>;
export type RefereeDto = z.infer<typeof refereeSchema>;
export type CreateAssignmentBody = z.infer<typeof createAssignmentBodySchema>;
export type UpdateAssignmentBody = z.infer<typeof updateAssignmentBodySchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;
export type AssignmentDto = z.infer<typeof assignmentSchema>;
