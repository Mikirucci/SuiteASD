import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import type { AppConfig } from '../../config/env.js';
import { conflict, unauthorized, unprocessable } from '../../lib/errors.js';
import type { PasswordHasher } from '../../lib/password.js';
import { normalizeEmail } from '../../lib/schemas.js';
import { createDefaultDocumentTypes } from '../../lib/society-defaults.js';
import { generateOpaqueToken, hashToken, signAccessToken } from '../../lib/tokens.js';
import { permissionsFor } from '../../rbac/permissions.js';
import { guardianRelationSchema, roleSchema, type Role } from '../../shared/enums.js';
import type {
  AcceptInvitationBody,
  LoginBody,
  MeResponse,
  RegisterBody,
  SessionResponse,
} from './schema.js';

export interface AuthDeps {
  // Auth flows act BEFORE a tenant is known, so they use the unscoped client (the only module allowed to).
  prisma: PrismaClient;
  config: AppConfig;
  passwords: PasswordHasher;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'societa'}-${randomBytes(3).toString('hex')}`;
}

export function createAuthService({ prisma, config, passwords }: AuthDeps) {
  // Verified when the email is unknown so that response time does not reveal which emails exist.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = (): Promise<string> => (dummyHash ??= passwords.hash(randomUUID()));

  async function issueSession(
    client: Prisma.TransactionClient,
    input: {
      user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
      society: { id: string; name: string };
      roles: Role[];
      familyId?: string;
      userAgent?: string;
    },
  ): Promise<SessionResponse> {
    const refreshToken = generateOpaqueToken();
    await client.refreshToken.create({
      data: {
        societyId: input.society.id,
        userId: input.user.id,
        familyId: input.familyId ?? randomUUID(),
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
        userAgent: input.userAgent?.slice(0, 255),
      },
    });
    const accessToken = await signAccessToken(config, {
      userId: input.user.id,
      societyId: input.society.id,
      roles: input.roles,
    });
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: input.user.id,
        email: input.user.email,
        firstName: input.user.firstName,
        lastName: input.user.lastName,
      },
      society: input.society,
      roles: input.roles,
    };
  }

  async function revokeFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async function register(body: RegisterBody, userAgent?: string): Promise<SessionResponse> {
    const email = normalizeEmail(body.admin.email);
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw conflict('email_taken', 'An account with this email already exists. Log in instead.');
    }
    const passwordHash = await passwords.hash(body.admin.password);
    return prisma.$transaction(async (tx) => {
      const society = await tx.society.create({
        data: { name: body.societyName, slug: slugify(body.societyName) },
      });
      const user = await tx.user.create({
        data: { email, passwordHash, firstName: body.admin.firstName, lastName: body.admin.lastName },
      });
      await tx.membership.create({ data: { societyId: society.id, userId: user.id, role: 'ADMIN' } });
      await createDefaultDocumentTypes(tx, society.id);
      return issueSession(tx, { user, society: { id: society.id, name: society.name }, roles: ['ADMIN'], userAgent });
    });
  }

  async function login(body: LoginBody, userAgent?: string): Promise<SessionResponse> {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(body.email) } });
    const passwordOk = await passwords.verify(user?.passwordHash ?? (await getDummyHash()), body.password);
    if (!user || !passwordOk || !user.isActive) throw unauthorized('Invalid email or password');

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, ...(body.societyId ? { societyId: body.societyId } : {}) },
      include: { society: true },
      orderBy: { createdAt: 'asc' },
    });
    const first = memberships[0];
    if (!first) throw unauthorized('Invalid email or password');
    const roles = memberships
      .filter((membership) => membership.societyId === first.societyId)
      .map((membership) => roleSchema.parse(membership.role));

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return prisma.$transaction((tx) =>
      issueSession(tx, { user, society: { id: first.society.id, name: first.society.name }, roles, userAgent }),
    );
  }

  // Refresh tokens are single-use. Presenting an already-used token means it leaked: the whole family is revoked.
  async function refresh(refreshToken: string, userAgent?: string): Promise<SessionResponse> {
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!record) throw unauthorized('Invalid refresh token');
    if (record.revokedAt) {
      await revokeFamily(record.familyId);
      throw unauthorized('Invalid refresh token');
    }
    if (record.expiresAt.getTime() <= Date.now()) throw unauthorized('Refresh token expired');

    const claimed = await prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      await revokeFamily(record.familyId);
      throw unauthorized('Invalid refresh token');
    }

    const [user, memberships] = await Promise.all([
      prisma.user.findUnique({ where: { id: record.userId } }),
      prisma.membership.findMany({
        where: { userId: record.userId, societyId: record.societyId },
        include: { society: true },
      }),
    ]);
    const first = memberships[0];
    if (!user || !user.isActive || !first) {
      await revokeFamily(record.familyId);
      throw unauthorized('Invalid refresh token');
    }
    // Roles are re-read here, so role changes take effect at the next refresh.
    const roles = memberships.map((membership) => roleSchema.parse(membership.role));
    return prisma.$transaction((tx) =>
      issueSession(tx, {
        user,
        society: { id: first.society.id, name: first.society.name },
        roles,
        familyId: record.familyId,
        userAgent,
      }),
    );
  }

  async function logout(refreshToken: string): Promise<void> {
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (record) await revokeFamily(record.familyId);
  }

  async function acceptInvitation(body: AcceptInvitationBody, userAgent?: string): Promise<SessionResponse> {
    const invalid = (): never => {
      throw unprocessable('invalid_invitation', 'The invitation is invalid, expired or already used');
    };
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt.getTime() <= Date.now()) {
      return invalid();
    }
    const role = roleSchema.parse(invitation.role);
    const existing = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existing) {
      if (!(await passwords.verify(existing.passwordHash, body.password))) {
        throw unauthorized('Invalid email or password');
      }
    } else if (!body.firstName || !body.lastName) {
      throw unprocessable('profile_required', 'firstName and lastName are required for a new account');
    }
    const passwordHash = existing ? existing.passwordHash : await passwords.hash(body.password);

    return prisma.$transaction(async (tx) => {
      // Atomic claim: only one concurrent request can consume the invitation.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) return invalid();

      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            firstName: body.firstName ?? '',
            lastName: body.lastName ?? '',
          },
        }));
      await tx.membership.upsert({
        where: { userId_societyId_role: { userId: user.id, societyId: invitation.societyId, role } },
        create: { userId: user.id, societyId: invitation.societyId, role },
        update: {},
      });

      if (invitation.memberId && role === 'ATLETA') {
        const member = await tx.member.findFirst({
          where: { id: invitation.memberId, societyId: invitation.societyId },
        });
        if (!member) return invalid();
        if (member.userId && member.userId !== user.id) {
          throw conflict('member_already_linked', 'This member is already linked to another account');
        }
        await tx.member.update({ where: { id: invitation.memberId }, data: { userId: user.id } });
      }
      if (invitation.memberId && role === 'GENITORE') {
        await tx.guardianLink.upsert({
          where: { guardianUserId_memberId: { guardianUserId: user.id, memberId: invitation.memberId } },
          create: { societyId: invitation.societyId, guardianUserId: user.id, memberId: invitation.memberId },
          update: {},
        });
      }

      const memberships = await tx.membership.findMany({
        where: { userId: user.id, societyId: invitation.societyId },
        include: { society: true },
      });
      const society = memberships[0]?.society;
      if (!society) return invalid();
      return issueSession(tx, {
        user,
        society: { id: society.id, name: society.name },
        roles: memberships.map((membership) => roleSchema.parse(membership.role)),
        userAgent,
      });
    });
  }

  async function me(auth: { userId: string; societyId: string; roles: readonly Role[] }): Promise<MeResponse> {
    const [user, society, memberships, member, links] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }),
      prisma.society.findUniqueOrThrow({ where: { id: auth.societyId } }),
      prisma.membership.findMany({
        where: { userId: auth.userId },
        include: { society: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.member.findFirst({ where: { societyId: auth.societyId, userId: auth.userId } }),
      prisma.guardianLink.findMany({
        where: { societyId: auth.societyId, guardianUserId: auth.userId },
        include: { member: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const societies = new Map<string, { id: string; name: string; roles: Role[] }>();
    for (const membership of memberships) {
      const entry = societies.get(membership.societyId) ?? {
        id: membership.society.id,
        name: membership.society.name,
        roles: [],
      };
      entry.roles.push(roleSchema.parse(membership.role));
      societies.set(membership.societyId, entry);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
      },
      society: { id: society.id, name: society.name, slug: society.slug },
      roles: [...auth.roles],
      permissions: permissionsFor(auth.roles),
      societies: [...societies.values()],
      member: member ? { id: member.id, firstName: member.firstName, lastName: member.lastName } : null,
      children: links.map((link) => ({
        memberId: link.memberId,
        firstName: link.member.firstName,
        lastName: link.member.lastName,
        relation: guardianRelationSchema.parse(link.relation),
      })),
    };
  }

  return { register, login, refresh, logout, acceptInvitation, me };
}

export type AuthService = ReturnType<typeof createAuthService>;
