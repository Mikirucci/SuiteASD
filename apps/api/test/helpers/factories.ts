import { randomUUID } from 'node:crypto';
import type { Member, Society, Team, User } from '@prisma/client';
import { signAccessToken } from '../../src/lib/tokens.js';
import type { Role } from '../../src/shared/enums.js';
import type { TestContext } from './app.js';

export const TEST_PASSWORD = 'Passw0rd!test';

export interface Actor {
  user: User;
  societyId: string;
  roles: Role[];
  token: string;
  headers: { authorization: string };
}

export async function createSociety(ctx: TestContext, name = 'Test ASD'): Promise<Society> {
  return ctx.prisma.society.create({ data: { name, slug: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID().slice(0, 8)}` } });
}

// A user with the given roles in `societyId`, plus a ready-to-use access token (no login round trip).
export async function createActor(ctx: TestContext, societyId: string, ...roles: Role[]): Promise<Actor> {
  const user = await ctx.prisma.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      passwordHash: await ctx.app.passwords.hash(TEST_PASSWORD),
      firstName: 'Test',
      lastName: roles.join('-'),
    },
  });
  for (const role of roles) await ctx.prisma.membership.create({ data: { societyId, userId: user.id, role } });
  const token = await signAccessToken(ctx.config, { userId: user.id, societyId, roles });
  return { user, societyId, roles, token, headers: { authorization: `Bearer ${token}` } };
}

export async function createTeam(ctx: TestContext, societyId: string, name = `Team ${randomUUID().slice(0, 6)}`): Promise<Team> {
  return ctx.prisma.team.create({ data: { societyId, name, category: 'U16' } });
}

export async function createMember(ctx: TestContext, societyId: string, overrides: Partial<Member> = {}): Promise<Member> {
  return ctx.prisma.member.create({
    data: { societyId, firstName: 'Anna', lastName: 'Ferri', ...overrides },
  });
}
