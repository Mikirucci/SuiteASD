import { z } from 'zod';
import { emailSchema, isoDateTimeSchema } from '../../lib/schemas.js';
import { roleSchema } from '../../shared/enums.js';

export const createInvitationBodySchema = z.object({
  email: emailSchema,
  role: roleSchema,
  // ATLETA: links the new account to this member. GENITORE: links the guardian to this athlete.
  memberId: z.string().min(1).max(64).optional(),
});

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
  memberId: z.string().nullable(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

// The raw token is returned exactly once, at creation (it is stored only as a hash).
export const createdInvitationSchema = invitationSchema.extend({ token: z.string() });

export type CreateInvitationBody = z.infer<typeof createInvitationBodySchema>;
export type InvitationDto = z.infer<typeof invitationSchema>;
export type CreatedInvitationDto = z.infer<typeof createdInvitationSchema>;
