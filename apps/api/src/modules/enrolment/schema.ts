import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, passwordSchema } from '../../lib/schemas.js';
import { guardianRelationSchema } from '../../shared/enums.js';
import { fiscalCodeSchema, memberGenderSchema } from '../members/schema.js';

const idRef = z.string().min(1).max(64);
const nameSchema = z.string().trim().min(1).max(80);

// ---- Administration: the links --------------------------------------------------------------------------------

export const JOIN_LINK_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED', 'EXHAUSTED'] as const;
export const joinLinkStatusSchema = z.enum(JOIN_LINK_STATUSES);

export const createJoinLinkBodySchema = z.object({
  teamId: idRef.optional().describe('Team the people who enrol are put in; none: they are enrolled with no team'),
  label: z.string().trim().min(1).max(80).optional().describe('Internal name, e.g. "Open day settembre"'),
  expiresAt: isoDateTimeSchema.optional().describe('After this moment the link no longer works'),
  maxUses: z.number().int().min(1).max(10_000).optional().describe('Enrolments the link allows'),
});

export const joinLinkSchema = z.object({
  id: z.string(),
  code: z.string(),
  url: z.string().describe('The link to share: opens the enrolment page of the web app'),
  label: z.string().nullable(),
  team: z.object({ id: z.string(), name: z.string(), category: z.string().nullable() }).nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  maxUses: z.number().int().nullable(),
  uses: z.number().int(),
  status: joinLinkStatusSchema,
  createdAt: isoDateTimeSchema,
});

export const joinCodeParamsSchema = z.object({ code: z.string().min(8).max(64) });

// ---- Public: what the person who opens the link sees and sends -------------------------------------------------

export const joinInfoSchema = z.object({
  society: z.object({ name: z.string() }),
  team: z.object({ name: z.string(), category: z.string().nullable() }).nullable(),
});

// Whoever enrols someone under this age must be a guardian: a minor of 13 or less cannot consent on their own
// (GDPR art. 8 as applied in Italy).
export const MIN_SELF_ENROLMENT_AGE = 14;

export const enrolBodySchema = z
  .object({
    kind: z.enum(['ATLETA', 'GENITORE']).describe('ATLETA: the athlete signs up. GENITORE: a guardian enrols a child'),
    account: z.object({
      email: emailSchema,
      password: passwordSchema.describe('A new password, or the current one when the email already has an account'),
      firstName: nameSchema,
      lastName: nameSchema,
      phone: z.string().trim().min(3).max(30).optional(),
    }),
    athlete: z.object({
      firstName: nameSchema.optional().describe('Required for GENITORE; the athlete takes the account name otherwise'),
      lastName: nameSchema.optional().describe('Required for GENITORE; the athlete takes the account name otherwise'),
      birthDate: z.iso.date(),
      birthPlace: z.string().trim().min(1).max(80).optional(),
      gender: memberGenderSchema.optional(),
      fiscalCode: fiscalCodeSchema.optional(),
      fieldRole: z.string().trim().min(1).max(40).optional(),
      address: z.string().trim().min(1).max(160).optional(),
      city: z.string().trim().min(1).max(80).optional(),
      postalCode: z.string().trim().min(1).max(10).optional(),
    }),
    relation: guardianRelationSchema.default('ALTRO').describe('Only for GENITORE'),
  })
  .refine((body) => body.kind === 'ATLETA' || (body.athlete.firstName && body.athlete.lastName), {
    path: ['athlete'],
    message: "The child's first and last name are required",
  });

export type CreateJoinLinkBody = z.infer<typeof createJoinLinkBodySchema>;
export type JoinLinkDto = z.infer<typeof joinLinkSchema>;
export type JoinInfoDto = z.infer<typeof joinInfoSchema>;
export type EnrolBody = z.infer<typeof enrolBodySchema>;
