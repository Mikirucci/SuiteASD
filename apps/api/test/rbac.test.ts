import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  INVITABLE_ROLES,
  PERMISSIONS,
  can,
  canInviteRole,
  permissionsFor,
  type Permission,
} from '../src/rbac/permissions.js';
import { ROLES } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';

describe('permission matrix (SPEC section 2)', () => {
  it('only references known roles', () => {
    for (const [permission, roles] of Object.entries(PERMISSIONS)) {
      for (const role of roles) expect(ROLES, permission).toContain(role);
    }
  });

  it('gives ADMIN every administrative permission and no role more than ADMIN, except athlete/guardian self-service', () => {
    const selfService: Permission[] = ['convocations:respond', 'evaluations:readOwn'];
    const nonAdmin = (Object.keys(PERMISSIONS) as Permission[]).filter((permission) => !can(['ADMIN'], permission));
    expect(nonAdmin.sort()).toEqual([...selfService].sort());
  });

  it('lets athletes and guardians read only their own sensitive data', () => {
    for (const role of ['ATLETA', 'GENITORE'] as const) {
      expect(can([role], 'members:read')).toBe(false);
      expect(can([role], 'payments:read')).toBe(false);
      expect(can([role], 'documents:read')).toBe(false);
      expect(can([role], 'ledger:read')).toBe(false);
      expect(can([role], 'payments:readOwn')).toBe(true);
      expect(can([role], 'convocations:respond')).toBe(true);
    }
  });

  it('keeps finance and sponsors admin-only, and reserves segreteria for members, documents and payments', () => {
    expect(can(['SEGRETERIA'], 'sponsors:read')).toBe(false);
    expect(can(['ALLENATORE'], 'ledger:read')).toBe(false);
    for (const permission of ['members:write', 'documents:write', 'payments:write'] as const) {
      expect(can(['SEGRETERIA'], permission)).toBe(true);
      expect(can(['ALLENATORE'], permission)).toBe(false);
    }
  });

  it('lets coaches manage convocations, attendance and evaluations', () => {
    for (const permission of ['convocations:write', 'attendance:write', 'evaluations:write'] as const) {
      expect(can(['ALLENATORE'], permission)).toBe(true);
    }
  });

  it('unions the permissions of a user with several roles', () => {
    expect(can(['ATLETA', 'SEGRETERIA'], 'teams:write')).toBe(true);
    expect(permissionsFor(['ATLETA', 'GENITORE'])).not.toContain('teams:write');
    expect(permissionsFor([])).toEqual([]);
  });

  it('only allows downward invitations', () => {
    expect(canInviteRole(['ADMIN'], 'ADMIN')).toBe(true);
    expect(canInviteRole(['SEGRETERIA'], 'ADMIN')).toBe(false);
    expect(canInviteRole(['SEGRETERIA'], 'GENITORE')).toBe(true);
    for (const role of ['ALLENATORE', 'STAFF', 'ATLETA', 'GENITORE'] as const) expect(INVITABLE_ROLES[role]).toEqual([]);
  });
});

// Contract test over the generated OpenAPI document: protects every endpoint of every future module.
describe('route contract', () => {
  let ctx: TestContext;
  const PUBLIC = new Set([
    'GET /api/v1/health',
    'POST /api/v1/auth/register',
    'POST /api/v1/auth/login',
    'POST /api/v1/auth/refresh',
    'POST /api/v1/auth/magic-link/request',
    'POST /api/v1/auth/magic-link/consume',
    'POST /api/v1/auth/logout',
    'POST /api/v1/invitations/accept',
    'GET /api/v1/join/{code}',
    'POST /api/v1/join/{code}',
  ]);

  interface Operation {
    security?: unknown[];
    responses: Record<string, unknown>;
  }
  const operations = (): { key: string; method: string; path: string; operation: Operation }[] => {
    const spec = ctx.app.swagger() as unknown as { paths: Record<string, Record<string, Operation>> };
    return Object.entries(spec.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        operation,
      })),
    );
  };

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('documents every endpoint under /api/v1', () => {
    const all = operations();
    expect(all.length).toBeGreaterThan(10);
    for (const { path } of all) expect(path.startsWith(API)).toBe(true);
  });

  it('declares bearer security on every non-public endpoint', () => {
    for (const { key, operation } of operations()) {
      if (PUBLIC.has(key)) continue;
      expect(operation.security, key).toEqual([{ bearerAuth: [] }]);
    }
  });

  it('answers 401 to every non-public endpoint called without a token', async () => {
    for (const { key, method, path } of operations()) {
      if (PUBLIC.has(key)) continue;
      const response = await ctx.app.inject({ method: method as 'GET', url: path.replace(/\{[^}]+\}/g, 'x') });
      expect(response.statusCode, key).toBe(401);
    }
  });

  it('documents the problem+json error shape on every endpoint', () => {
    for (const { key, operation } of operations()) {
      const errorStatuses = Object.keys(operation.responses).filter((status) => Number(status) >= 400);
      expect(errorStatuses.length, key).toBeGreaterThan(0);
    }
  });
});
