import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { AppError, conflict, notFound, unauthorized, unprocessable } from '../../lib/errors.js';
import type { PasswordHasher } from '../../lib/password.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { normalizeEmail } from '../../lib/schemas.js';
import { scopeToTenant } from '../../lib/tenant.js';
import { roleSchema } from '../../shared/enums.js';
import { parseDateOnly } from '../documents/status.js';
import {
  MIN_SELF_ENROLMENT_AGE,
  type EnrolBody,
  type JoinInfoDto,
  type JoinLinkDto,
} from '../enrolment/schema.js';
import { joinLinkStatus } from '../enrolment/service.js';
import { notifyAdministration } from '../notifications/admin-alerts.js';
import type { SessionResponse } from './schema.js';
import { issueSession } from './session.js';

type JoinLinkStatus = JoinLinkDto['status'];

// The person who opens an enrolment link: public, so it acts BEFORE a tenant is known and uses the unscoped client
// like the rest of the auth module (the administration side of the links lives in modules/enrolment).

export interface JoinDeps {
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

export function createJoinService({ prisma, config, passwords, log }: JoinDeps) {
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
