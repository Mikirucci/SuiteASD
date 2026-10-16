import { randomBytes } from 'node:crypto';
import type { JoinLink, Team } from '@prisma/client';
import type { AppConfig } from '../../config/env.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import type { CreateJoinLinkBody, JoinLinkDto } from './schema.js';

type JoinLinkWithTeam = JoinLink & { team: Pick<Team, 'id' | 'name' | 'category'> | null };
type UrlConfig = Pick<AppConfig, 'WEB_BASE_URL'>;

export function joinLinkStatus(
  link: Pick<JoinLink, 'revokedAt' | 'expiresAt' | 'maxUses' | 'uses'>,
  now: Date,
): JoinLinkDto['status'] {
  if (link.revokedAt) return 'REVOKED';
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (link.maxUses !== null && link.uses >= link.maxUses) return 'EXHAUSTED';
  return 'ACTIVE';
}

export function joinUrl(config: UrlConfig, code: string): string {
  return `${config.WEB_BASE_URL}/iscrizione/${code}`;
}

function toDto(link: JoinLinkWithTeam, config: UrlConfig, now: Date): JoinLinkDto {
  return {
    id: link.id,
    code: link.code,
    url: joinUrl(config, link.code),
    label: link.label,
    team: link.team ? { id: link.team.id, name: link.team.name, category: link.team.category } : null,
    expiresAt: toIsoOrNull(link.expiresAt),
    maxUses: link.maxUses,
    uses: link.uses,
    status: joinLinkStatus(link, now),
    createdAt: toIso(link.createdAt),
  };
}

const withTeam = { team: { select: { id: true, name: true, category: true } } } as const;

// ---------------------------------------------------------------------------------------------------------------
// Administration: create, list and revoke the links
// ---------------------------------------------------------------------------------------------------------------

export async function createJoinLink(
  { db, auth }: TenantRequestContext,
  config: UrlConfig,
  body: CreateJoinLinkBody,
): Promise<JoinLinkDto> {
  if (body.teamId && !(await db.team.findFirst({ where: { id: body.teamId }, select: { id: true } }))) {
    throw notFound('Team');
  }
  if (body.expiresAt && new Date(body.expiresAt).getTime() <= Date.now()) {
    throw unprocessable('invalid_expiry', 'The expiry date must be in the future');
  }
  const link = await db.joinLink.create({
    data: {
      societyId: auth.societyId,
      teamId: body.teamId ?? null,
      // 12 random bytes: unguessable, and short enough to type or read out.
      code: randomBytes(12).toString('base64url'),
      label: body.label ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      maxUses: body.maxUses ?? null,
      createdById: auth.userId,
    },
    include: withTeam,
  });
  return toDto(link, config, new Date());
}

export async function listJoinLinks(
  { db }: TenantRequestContext,
  config: UrlConfig,
  query: PaginationQuery,
): Promise<Page<JoinLinkDto>> {
  const rows = await db.joinLink.findMany({
    include: withTeam,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  const now = new Date();
  return { data: page.data.map((row) => toDto(row, config, now)), page: page.page };
}

// Revoking keeps the row (and its use count): the people who already enrolled are not affected.
export async function revokeJoinLink({ db }: TenantRequestContext, id: string): Promise<void> {
  const result = await db.joinLink.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count === 0) throw notFound('Enrolment link');
}
