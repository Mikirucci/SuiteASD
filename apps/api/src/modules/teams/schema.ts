import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { sportSchema, teamGenderSchema } from '../../shared/enums.js';

// Zod schemas are the single source for validation, TypeScript types AND the OpenAPI document.

const idRef = z.string().min(1).max(64);

export const createTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40).optional().describe('Age band shown as badge, e.g. U14, Serie D'),
  sport: sportSchema.default('VOLLEY'),
  gender: teamGenderSchema.optional(),
  description: z.string().trim().max(500).optional(),
  seasonId: idRef.optional(),
});

// PATCH: every field optional; `null` clears an optional field.
export const updateTeamBodySchema = z
  .object({
    name: createTeamBodySchema.shape.name,
    category: createTeamBodySchema.shape.category.nullable(),
    sport: sportSchema,
    gender: teamGenderSchema.nullable(),
    description: createTeamBodySchema.shape.description.nullable(),
    seasonId: idRef.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const listTeamsQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional().describe('Substring of the team name'),
  category: z.string().trim().min(1).max(40).optional(),
});

export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  sport: sportSchema,
  gender: teamGenderSchema.nullable(),
  description: z.string().nullable(),
  seasonId: z.string().nullable(),
  membersCount: z.number().int().describe('Athletes currently in the team'),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CreateTeamBody = z.infer<typeof createTeamBodySchema>;
export type UpdateTeamBody = z.infer<typeof updateTeamBodySchema>;
export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;
export type TeamDto = z.infer<typeof teamSchema>;

export const addTeamMembersBodySchema = z.object({
  memberIds: z.array(idRef).min(1).max(100).describe('Members to add; those already in the team are left as they are'),
});

export const addTeamMembersResultSchema = z.object({
  added: z.number().int().describe('Members who entered the team with this request'),
  alreadyInTeam: z.number().int().describe('Members who were already in the team'),
});

export type AddTeamMembersBody = z.infer<typeof addTeamMembersBodySchema>;
export type AddTeamMembersResult = z.infer<typeof addTeamMembersResultSchema>;
