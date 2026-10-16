import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../lib/schemas.js';
import { roleSchema, guardianRelationSchema } from '../../shared/enums.js';

const nameSchema = z.string().trim().min(1).max(80);

export const registerBodySchema = z.object({
  societyName: z.string().trim().min(2).max(120),
  admin: z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: nameSchema,
  }),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  // Needed only when the account belongs to several societies; defaults to the oldest membership.
  societyId: z.string().min(1).max(64).optional(),
});

export const refreshBodySchema = z.object({ refreshToken: z.string().min(1).max(256) });

export const logoutBodySchema = refreshBodySchema;

export const acceptInvitationBodySchema = z.object({
  token: z.string().min(1).max(256),
  password: passwordSchema,
  // Used only when the invited email has no account yet.
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
});

export const magicLinkRequestBodySchema = z.object({ email: emailSchema });

// Always the same body, whether or not the email belongs to an account.
export const magicLinkRequestResponseSchema = z.object({ status: z.literal('accepted') });

export const magicLinkConsumeBodySchema = z.object({
  token: z.string().min(1).max(256),
  // Needed only when the account belongs to several societies; defaults to the oldest membership (as login).
  societyId: z.string().min(1).max(64).optional(),
});

export const changePasswordBodySchema = z.object({
  newPassword: passwordSchema,
  // Required unless the access token comes from a magic link.
  currentPassword: z.string().min(1).max(128).optional(),
});

export const userSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});

export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().describe('Access token lifetime in seconds'),
  user: userSummarySchema,
  society: z.object({ id: z.string(), name: z.string() }),
  roles: z.array(roleSchema),
});

export const meResponseSchema = z.object({
  user: userSummarySchema.extend({ phone: z.string().nullable() }),
  society: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  roles: z.array(roleSchema),
  permissions: z.array(z.string()),
  societies: z.array(z.object({ id: z.string(), name: z.string(), roles: z.array(roleSchema) })),
  member: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  children: z.array(
    z.object({
      memberId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      relation: guardianRelationSchema,
    }),
  ),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AcceptInvitationBody = z.infer<typeof acceptInvitationBodySchema>;
export type MagicLinkConsumeBody = z.infer<typeof magicLinkConsumeBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
