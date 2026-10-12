import type { Invitation } from '@prisma/client';
import type { AppConfig } from '../../config/env.js';
import { forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { normalizeEmail, toIso } from '../../lib/schemas.js';
import { generateOpaqueToken, hashToken } from '../../lib/tokens.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { canInviteRole } from '../../rbac/permissions.js';
import { roleSchema } from '../../shared/enums.js';
import type { CreateInvitationBody, CreatedInvitationDto, InvitationDto } from './schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toDto(invitation: Invitation): InvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    role: roleSchema.parse(invitation.role),
    memberId: invitation.memberId,
    expiresAt: toIso(invitation.expiresAt),
    createdAt: toIso(invitation.createdAt),
  };
}

export async function createInvitation(
  { db, auth }: TenantRequestContext,
  config: AppConfig,
  body: CreateInvitationBody,
): Promise<CreatedInvitationDto> {
  if (!canInviteRole(auth.roles, body.role)) throw forbidden(`You cannot invite users with role ${body.role}`);

  if (body.memberId) {
    if (body.role !== 'ATLETA' && body.role !== 'GENITORE') {
      throw unprocessable('member_not_applicable', 'memberId is only valid for ATLETA and GENITORE invitations');
    }
    // Cross-tenant ids are rejected here: the scoped client only sees this society's members.
    const member = await db.member.findFirst({ where: { id: body.memberId }, select: { id: true } });
    if (!member) throw notFound('Member');
  }

  const token = generateOpaqueToken();
  const invitation = await db.invitation.create({
    data: {
      societyId: auth.societyId,
      email: normalizeEmail(body.email),
      role: body.role,
      memberId: body.memberId ?? null,
      invitedById: auth.userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + config.INVITATION_TTL_DAYS * DAY_MS),
    },
  });
  return { ...toDto(invitation), token };
}

// Pending invitations only (not accepted, not revoked, not expired).
export async function listInvitations(
  { db }: TenantRequestContext,
  query: PaginationQuery,
): Promise<Page<InvitationDto>> {
  const rows = await db.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toDto), page: page.page };
}

export async function revokeInvitation({ db }: TenantRequestContext, id: string): Promise<void> {
  const result = await db.invitation.updateMany({
    where: { id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw notFound('Invitation');
}
