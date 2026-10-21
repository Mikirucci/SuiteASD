import { z } from 'zod';
import { emailSchema, isoDateTimeSchema } from '../../lib/schemas.js';
import { roleSchema } from '../../shared/enums.js';

export const createInvitationBodySchema = z.object({
  // Not needed: the platform does not send the link (no email delivery yet), so the invited person gives the email
  // when joining. When it is given here the account is created with exactly that email.
  email: emailSchema.optional(),
  // Free note of who the link is for, to tell the pending invitations apart.
  label: z.string().trim().min(1).max(80).optional(),
  role: roleSchema,
  // ATLETA: links the new account to this member. GENITORE: links the guardian to this athlete.
  memberId: z.string().min(1).max(64).optional(),
});

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  label: z.string().nullable(),
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
