import { randomBytes } from 'node:crypto';
import type { JoinLink, PrismaClient, Team } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { AppError, conflict, notFound, unauthorized, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import type { PasswordHasher } from '../../lib/password.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { normalizeEmail, toIso, toIsoOrNull } from '../../lib/schemas.js';
import { scopeToTenant } from '../../lib/tenant.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { roleSchema } from '../../shared/enums.js';
import type { SessionResponse } from '../auth/schema.js';
import { issueSession } from '../auth/session.js';
import { parseDateOnly } from '../documents/status.js';
import { notifyAdministration } from '../notifications/admin-alerts.js';
import {
  MIN_SELF_ENROLMENT_AGE,
  type CreateJoinLinkBody,
  type EnrolBody,
  type JoinInfoDto,
  type JoinLinkDto,
} from './schema.js';

type JoinLinkStatus = JoinLinkDto['status'];
type JoinLinkWithTeam = JoinLink & { team: Pick<Team, 'id' | 'name' | 'category'> | null };
type UrlConfig = Pick<AppConfig, 'WEB_BASE_URL'>;

export function joinLinkStatus(
  link: Pick<JoinLink, 'revokedAt' | 'expiresAt' | 'maxUses' | 'uses'>,
  now: Date,
): JoinLinkStatus {
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

// ---------------------------------------------------------------------------------------------------------------
// Public: the person who opens a link
// ---------------------------------------------------------------------------------------------------------------

export interface EnrolmentDeps {
  // Enrolment acts BEFORE a tenant is known (like the auth flows): it uses the unscoped client.
  prisma: PrismaClient;
  config: AppConfig;
  passwords: PasswordHasher;
  log: FastifyBaseLogger;
}

function ageOn(birthDate: Date, today: Date): number {
  const age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayPassed =
    today.getUTCMonth() > birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() >= birthDate.getUTCDate());
  return birthdayPassed ? age : age - 1;
}

const GONE_CODES: Record<Exclude<JoinLinkStatus, 'ACTIVE'>, string> = {
  REVOKED: 'join_link_revoked',
  EXPIRED: 'join_link_expired',
  EXHAUSTED: 'join_link_exhausted',
};

const gone = (status: Exclude<JoinLinkStatus, 'ACTIVE'>): AppError =>
  new AppError(410, GONE_CODES[status], 'This enrolment link is no longer valid');

// Which unique constraint failed: the account email or the fiscal code of the member.
function duplicateOf(error: unknown): AppError {
  const target = JSON.stringify((error as { meta?: { target?: unknown } }).meta?.target ?? '');
  if (target.includes('fiscalCode')) {
    return conflict(
      'fiscal_code_taken',
      'An athlete with this fiscal code is already registered: ask the secretary to send you an invitation',
    );
  }
  if (target.includes('email')) return conflict('email_taken', 'An account with this email already exists');
  return conflict('already_enrolled', 'This person is already enrolled');
}

export function createEnrolmentService({ prisma, config, passwords, log }: EnrolmentDeps) {
  // Unknown codes are 404; a known link that stopped working is 410 with the reason, so the page can explain it.
  async function activeLink(code: string, now: Date) {
    const link = await prisma.joinLink.findUnique({ where: { code }, include: { society: true, team: true } });
    if (!link) throw notFound('Enrolment link');
    const status = joinLinkStatus(link, now);
    if (status !== 'ACTIVE') throw gone(status);
    return link;
  }

  async function describe(code: string): Promise<JoinInfoDto> {
    const link = await activeLink(code, new Date());
    return {
      society: { name: link.society.name },
      team: link.team ? { name: link.team.name, category: link.team.category } : null,
    };
  }

  // The administration hears about it at once. A failure here must not undo an enrolment that went through.
  async function alertAdministration(input: {
    societyId: string;
    memberId: string;
    memberName: string;
    teamName: string | null;
    now: Date;
  }): Promise<void> {
    try {
      await notifyAdministration(scopeToTenant(prisma, input.societyId), {
        societyId: input.societyId,
        template: { type: 'ADMIN_NEW_ENROLMENT', memberName: input.memberName, teamName: input.teamName },
        dedupeKey: `enrolment:${input.memberId}`,
        data: { memberId: input.memberId },
        now: input.now,
      });
    } catch (error) {
      log.error({ err: error, societyId: input.societyId, memberId: input.memberId }, 'could not notify the administration of an enrolment');
    }
  }

  async function enrol(code: string, body: EnrolBody, userAgent?: string): Promise<SessionResponse> {
    const now = new Date();
    const link = await activeLink(code, now);
    const { societyId } = link;

    const birthDate = parseDateOnly(body.athlete.birthDate);
    if (birthDate.getTime() > now.getTime()) {
      throw unprocessable('invalid_birth_date', 'The birth date cannot be in the future');
    }
    if (body.kind === 'ATLETA' && ageOn(birthDate, now) < MIN_SELF_ENROLMENT_AGE) {
      throw unprocessable(
        'guardian_required',
        `Under ${MIN_SELF_ENROLMENT_AGE} a parent or guardian has to enrol the athlete`,
      );
    }

    const email = normalizeEmail(body.account.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Somebody who already has an account proves it with the password (as when accepting an invitation).
      if (!existing.isActive || !(await passwords.verify(existing.passwordHash, body.account.password))) {
        throw unauthorized('Invalid email or password');
      }
    }
    const passwordHash = existing ? existing.passwordHash : await passwords.hash(body.account.password);

    const isGuardian = body.kind === 'GENITORE';
    const role = isGuardian ? 'GENITORE' : 'ATLETA';
    const firstName = body.athlete.firstName ?? body.account.firstName;
    const lastName = body.athlete.lastName ?? body.account.lastName;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Atomic claim of one use: concurrent enrolments cannot go past `maxUses`.
        const claimed = await tx.joinLink.updateMany({
          where: { id: link.id, revokedAt: null, ...(link.maxUses === null ? {} : { uses: { lt: link.maxUses } }) },
          data: { uses: { increment: 1 } },
        });
        if (claimed.count === 0) throw gone('EXHAUSTED');

        const user =
          existing ??
          (await tx.user.create({
            data: {
              email,
              passwordHash,
              firstName: body.account.firstName,
              lastName: body.account.lastName,
              phone: body.account.phone ?? null,
            },
          }));
        if (!isGuardian && (await tx.member.findFirst({ where: { societyId, userId: user.id }, select: { id: true } }))) {
          throw conflict('member_already_exists', 'You are already enrolled in this society');
        }
        await tx.membership.upsert({
          where: { userId_societyId_role: { userId: user.id, societyId, role } },
          create: { userId: user.id, societyId, role },
          update: {},
        });

        const member = await tx.member.create({
          data: {
            societyId,
            userId: isGuardian ? null : user.id,
            firstName,
            lastName,
            birthDate,
            birthPlace: body.athlete.birthPlace ?? null,
            gender: body.athlete.gender ?? null,
            fiscalCode: body.athlete.fiscalCode ?? null,
            fieldRole: body.athlete.fieldRole ?? null,
            address: body.athlete.address ?? null,
            city: body.athlete.city ?? null,
            postalCode: body.athlete.postalCode ?? null,
            email: isGuardian ? null : email,
            phone: isGuardian ? null : (body.account.phone ?? null),
            status: 'ACTIVE',
            joinedAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          },
        });
        if (link.teamId) {
          await tx.teamMembership.create({ data: { societyId, teamId: link.teamId, memberId: member.id } });
        }
        if (isGuardian) {
          await tx.guardianLink.create({
            data: { societyId, guardianUserId: user.id, memberId: member.id, relation: body.relation },
          });
        }

        const memberships = await tx.membership.findMany({ where: { userId: user.id, societyId } });
        const session = await issueSession(config, tx, {
          user,
          society: { id: link.society.id, name: link.society.name },
          roles: memberships.map((membership) => roleSchema.parse(membership.role)),
          userAgent,
        });
        return { session, memberId: member.id };
      });

      await alertAdministration({
        societyId,
        memberId: result.memberId,
        memberName: `${firstName} ${lastName}`,
        teamName: link.team?.name ?? null,
        now,
      });
      return result.session;
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateOf(error);
      throw error;
    }
  }

  return { describe, enrol };
}
