import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import type { AppConfig } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { EmailTransport } from '../lib/email.js';
import type { PasswordHasher } from '../lib/password.js';
import { scopeToTenant, type TenantDb } from '../lib/tenant.js';
import { verifyAccessToken, type AuthContext } from '../lib/tokens.js';
import { can, type Permission } from '../rbac/permissions.js';
import type { Role } from '../shared/enums.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    // Unscoped client: ONLY for auth flows, scheduler and health. Modules use `tenantOf(request).db`.
    prisma: PrismaClient;
    passwords: PasswordHasher;
    // Null when no email provider is configured.
    emailTransport: EmailTransport | null;
    requireAuth: onRequestAsyncHookHandler;
    requirePermission: (permission: Permission) => onRequestAsyncHookHandler;
    requireRole: (...roles: Role[]) => onRequestAsyncHookHandler;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
    db: TenantDb | null;
  }
}

// OpenAPI: add to every protected route schema (`security: bearerSecurity`).
export const bearerSecurity = [{ bearerAuth: [] }];

export interface TenantRequestContext {
  auth: AuthContext;
  db: TenantDb;
}

// Authenticated context of the current request: the societyId always comes from the signed token.
export function tenantOf(request: FastifyRequest): TenantRequestContext {
  if (!request.auth || !request.db) throw unauthorized();
  return { auth: request.auth, db: request.db };
}

async function authenticate(app: FastifyInstance, request: FastifyRequest): Promise<AuthContext> {
  const header = request.headers.authorization;
  const match = header ? /^Bearer (\S+)$/.exec(header) : null;
  const token = match?.[1];
  if (!token) throw unauthorized();
  const auth = await verifyAccessToken(app.config, token);
  if (!auth) throw unauthorized('Invalid or expired access token');
  request.auth = auth;
  request.db = scopeToTenant(app.prisma, auth.societyId);
  return auth;
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('auth', null);
  app.decorateRequest('db', null);

  const requireAuth: onRequestAsyncHookHandler = async (request) => {
    await authenticate(app, request);
  };
  app.decorate('requireAuth', requireAuth);

  app.decorate('requirePermission', (permission: Permission): onRequestAsyncHookHandler => {
    return async (request) => {
      const auth = await authenticate(app, request);
      if (!can(auth.roles, permission)) throw forbidden();
    };
  });

  app.decorate('requireRole', (...roles: Role[]): onRequestAsyncHookHandler => {
    return async (request) => {
      const auth = await authenticate(app, request);
      if (!auth.roles.some((role) => roles.includes(role))) throw forbidden();
    };
  });
});
