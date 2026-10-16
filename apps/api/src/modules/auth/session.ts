import { randomUUID } from 'node:crypto';
import type { Prisma, User } from '@prisma/client';
import type { AppConfig } from '../../config/env.js';
import { generateOpaqueToken, hashToken, signAccessToken, type AuthContext } from '../../lib/tokens.js';
import type { Role } from '../../shared/enums.js';
import type { SessionResponse } from './schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssueSessionInput {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
  society: { id: string; name: string };
  roles: Role[];
  familyId?: string;
  userAgent?: string;
  authMethod?: AuthContext['authMethod'];
}

// Opens a session for a user in one society: a new refresh token (one family per login) and an access token.
// Shared by every flow that ends with the caller signed in (login, registration, invitation, enrolment link).
export async function issueSession(
  config: AppConfig,
  client: Prisma.TransactionClient,
  input: IssueSessionInput,
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
    authMethod: input.authMethod,
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
