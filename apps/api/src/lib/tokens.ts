import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { roleSchema, type Role } from '../shared/enums.js';

const ISSUER = 'suiteasd-api';
const AUDIENCE = 'suiteasd';

// The tenant (societyId) and roles live in the signed token: clients can never choose them per request.
export interface AuthContext {
  userId: string;
  societyId: string;
  roles: readonly Role[];
  // Set only on the access token issued by consuming a magic link (not carried over by refresh): it lets the user
  // choose a new password without the current one for as long as that token lives.
  authMethod?: 'magic_link';
}

const accessClaimsSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  roles: z.array(roleSchema).min(1),
  amr: z.literal('magic_link').optional(),
});

function secretKey(config: AppConfig): Uint8Array {
  return new TextEncoder().encode(config.JWT_SECRET);
}

export async function signAccessToken(config: AppConfig, auth: AuthContext): Promise<string> {
  return new SignJWT({ sid: auth.societyId, roles: [...auth.roles], ...(auth.authMethod ? { amr: auth.authMethod } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(auth.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey(config));
}

// Resolves null for any invalid, expired or malformed token.
export async function verifyAccessToken(config: AppConfig, token: string): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(config), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    const claims = accessClaimsSchema.safeParse(payload);
    if (!claims.success) return null;
    const { sub, sid, roles, amr } = claims.data;
    return { userId: sub, societyId: sid, roles, ...(amr ? { authMethod: amr } : {}) };
  } catch {
    return null;
  }
}

// Opaque secrets (refresh tokens, invitation tokens): 256 random bits, stored only as SHA-256.
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
