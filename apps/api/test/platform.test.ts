import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { checkHealth } from '../src/modules/health/service.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';

describe('platform', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({ CORS_ORIGINS: 'http://localhost:3000' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /api/v1/health reports liveness and database readiness without authentication', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: `${API}/health` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('reports a degraded status when the database is unreachable', async () => {
    const unreachable = new PrismaClient({ datasourceUrl: 'file:/nonexistent-dir/none.db' });
    try {
      expect(await checkHealth(unreachable)).toMatchObject({ status: 'degraded', database: 'down' });
    } finally {
      await unreachable.$disconnect();
    }
  });

  it('sends security headers on API responses', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: `${API}/health` });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the configured web origin through CORS and not others', async () => {
    const allowed = await ctx.app.inject({
      method: 'OPTIONS',
      url: `${API}/teams`,
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const denied = await ctx.app.inject({
      method: 'OPTIONS',
      url: `${API}/teams`,
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers malformed JSON with a 400 problem document and no internals', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `${API}/auth/login`,
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).not.toHaveProperty('stack');
  });

  it('serves the OpenAPI document and the interactive reference', async () => {
    const reference = await ctx.app.inject({ method: 'GET', url: '/docs/' });
    expect(reference.statusCode).toBe(200);
    expect(reference.headers['content-type']).toContain('text/html');
    const spec = await ctx.app.inject({ method: 'GET', url: '/docs/openapi.json' });
    expect(spec.statusCode).toBe(200);
    const document = spec.json();
    expect(document.openapi).toMatch(/^3\./);
    expect(document.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([`${API}/teams`, `${API}/teams/{id}`, `${API}/auth/login`, `${API}/devices`]),
    );
  });
});

describe('configuration', () => {
  const valid = { DATABASE_URL: 'file:./x.db', JWT_SECRET: 'a'.repeat(32) };

  it('applies defaults (port 4000, web origin on :3000)', () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(config.SCHEDULER_ENABLED).toBe(true);
  });

  it('parses a comma separated CORS list', () => {
    expect(loadConfig({ ...valid, CORS_ORIGINS: 'https://a.test, https://b.test' }).CORS_ORIGINS).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('rejects a short JWT secret and a missing database url', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ JWT_SECRET: valid.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('refuses the development secret in production', () => {
    expect(() =>
      loadConfig({ ...valid, NODE_ENV: 'production', JWT_SECRET: `dev-only-${'x'.repeat(30)}` }),
    ).toThrow(/development default/);
  });
});
