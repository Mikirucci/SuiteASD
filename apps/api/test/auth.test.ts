import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/lib/tokens.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { TEST_PASSWORD, createActor, createSociety } from './helpers/factories.js';

interface Session {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email: string };
  society: { id: string; name: string };
  roles: string[];
}

describe('authentication', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const register = (email: string, overrides: object = {}) =>
    ctx.app.inject({
      method: 'POST',
      url: `${API}/auth/register`,
      payload: {
        societyName: 'Aquile Volley',
        admin: { email, password: TEST_PASSWORD, firstName: 'Paolo', lastName: 'Marchetti' },
        ...overrides,
      },
    });
  const login = (email: string, password = TEST_PASSWORD, societyId?: string) =>
    ctx.app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email, password, societyId } });
  const refresh = (refreshToken: string) =>
    ctx.app.inject({ method: 'POST', url: `${API}/auth/refresh`, payload: { refreshToken } });
  const me = (accessToken: string) =>
    ctx.app.inject({ method: 'GET', url: `${API}/me`, headers: { authorization: `Bearer ${accessToken}` } });

  describe('register', () => {
    it('creates the society, its administrator and a usable session', async () => {
      const response = await register('presidente@example.test');
      expect(response.statusCode).toBe(201);
      const session: Session = response.json();
      expect(session).toMatchObject({ tokenType: 'Bearer', roles: ['ADMIN'], society: { name: 'Aquile Volley' } });
      expect(session).not.toHaveProperty('user.passwordHash');

      const profile = await me(session.accessToken);
      expect(profile.statusCode).toBe(200);
      expect(profile.json()).toMatchObject({
        user: { email: 'presidente@example.test', firstName: 'Paolo' },
        society: { id: session.society.id },
        roles: ['ADMIN'],
        member: null,
        children: [],
      });
      expect(profile.json().permissions).toContain('teams:write');
    });

    it('starts the society with the default document types', async () => {
      const session: Session = (await register('docs@example.test')).json();
      const types = await ctx.prisma.documentType.findMany({ where: { societyId: session.society.id } });
      expect(types.map((type) => type.key).sort()).toEqual(['MEDICAL_CERTIFICATE', 'MEMBERSHIP_FORM', 'PRIVACY_CONSENT']);
    });

    it('stores a hash, never the password', async () => {
      await register('hash@example.test');
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'hash@example.test' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(TEST_PASSWORD);
    });

    it('normalizes the email and rejects duplicates', async () => {
      await register('Duplicate@Example.test');
      const again = await register('duplicate@example.test');
      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'email_taken' });
    });

    it('rejects weak passwords and invalid emails with field errors', async () => {
      const response = await register('not-an-email', {
        admin: { email: 'not-an-email', password: 'short', firstName: 'A', lastName: 'B' },
      });
      expect(response.statusCode).toBe(422);
      const paths = response.json().errors.map((error: { path: string }) => error.path);
      expect(paths).toEqual(expect.arrayContaining(['admin.email', 'admin.password']));
    });
  });

  describe('login', () => {
    it('returns a session for valid credentials', async () => {
      await register('login@example.test');
      const response = await login('LOGIN@example.test');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ roles: ['ADMIN'], expiresIn: 900 });
    });

    it('answers identically for a wrong password and an unknown email', async () => {
      await register('known@example.test');
      const wrongPassword = await login('known@example.test', 'wrong-password');
      const unknownEmail = await login('ghost@example.test');
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownEmail.statusCode).toBe(401);
      expect(wrongPassword.json().detail).toBe(unknownEmail.json().detail);
    });

    it('refuses deactivated accounts', async () => {
      await register('inactive@example.test');
      await ctx.prisma.user.update({ where: { email: 'inactive@example.test' }, data: { isActive: false } });
      expect((await login('inactive@example.test')).statusCode).toBe(401);
    });

    it('lets a multi-society user pick the society and defaults to the oldest membership', async () => {
      const first: Session = (await register('multi@example.test')).json();
      const second = await createSociety(ctx, 'Seconda ASD');
      await ctx.prisma.membership.create({ data: { societyId: second.id, userId: first.user.id, role: 'ALLENATORE' } });

      expect((await login('multi@example.test')).json()).toMatchObject({ society: { id: first.society.id } });
      const picked = await login('multi@example.test', TEST_PASSWORD, second.id);
      expect(picked.json()).toMatchObject({ society: { id: second.id }, roles: ['ALLENATORE'] });
      const profile = await me(picked.json().accessToken);
      expect(profile.json().societies).toHaveLength(2);
    });

    it('refuses a society the user does not belong to', async () => {
      await register('outsider@example.test');
      const foreign = await createSociety(ctx, 'Foreign');
      expect((await login('outsider@example.test', TEST_PASSWORD, foreign.id)).statusCode).toBe(401);
    });

    it('carries every role of a multi-role user in the token', async () => {
      const society = await createSociety(ctx, 'Roles ASD');
      const actor = await createActor(ctx, society.id, 'ALLENATORE', 'GENITORE');
      const response = await login(actor.user.email);
      expect(response.json().roles.sort()).toEqual(['ALLENATORE', 'GENITORE']);
    });
  });

  describe('access token', () => {
    it('rejects missing, malformed and non-bearer authorization headers', async () => {
      for (const authorization of ['Basic abc', 'Bearer', 'Bearer a b']) {
        const response = await ctx.app.inject({ method: 'GET', url: `${API}/me`, headers: { authorization } });
        expect(response.statusCode).toBe(401);
      }
      expect((await ctx.app.inject({ method: 'GET', url: `${API}/me` })).statusCode).toBe(401);
    });

    it('rejects an expired token', async () => {
      const session: Session = (await register('expired@example.test')).json();
      const expired = await new SignJWT({ sid: session.society.id, roles: ['ADMIN'] })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(session.user.id)
        .setIssuer('suiteasd-api')
        .setAudience('suiteasd')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(ctx.config.JWT_SECRET));
      expect((await me(expired)).statusCode).toBe(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const session: Session = (await register('forged@example.test')).json();
      const forged = await new SignJWT({ sid: session.society.id, roles: ['ADMIN'] })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(session.user.id)
        .setIssuer('suiteasd-api')
        .setAudience('suiteasd')
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('another-secret-another-secret-another-secret'));
      expect((await me(forged)).statusCode).toBe(401);
    });
  });

  describe('refresh token rotation', () => {
    it('issues a new pair and invalidates the used refresh token', async () => {
      const first: Session = (await register('rotate@example.test')).json();
      const second = await refresh(first.refreshToken);
      expect(second.statusCode).toBe(200);
      expect(second.json().refreshToken).not.toBe(first.refreshToken);
      expect((await me(second.json().accessToken)).statusCode).toBe(200);
    });

    it('revokes the whole family when a rotated token is replayed', async () => {
      const first: Session = (await register('reuse@example.test')).json();
      const second: Session = (await refresh(first.refreshToken)).json();

      const replay = await refresh(first.refreshToken);
      expect(replay.statusCode).toBe(401);
      // the legitimate, newer token of the same family is now dead too
      expect((await refresh(second.refreshToken)).statusCode).toBe(401);
    });

    it('does not touch other sessions of the same user when one family is revoked', async () => {
      await register('devices@example.test');
      const phone: Session = (await login('devices@example.test')).json();
      const laptop: Session = (await login('devices@example.test')).json();
      await refresh(phone.refreshToken);
      await refresh(phone.refreshToken);
      expect((await refresh(laptop.refreshToken)).statusCode).toBe(200);
    });

    it('rejects unknown and expired refresh tokens', async () => {
      expect((await refresh('unknown-token')).statusCode).toBe(401);
      const session: Session = (await register('stale@example.test')).json();
      await ctx.prisma.refreshToken.update({
        where: { tokenHash: hashToken(session.refreshToken) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    });

    it('applies role changes at the next refresh', async () => {
      const session: Session = (await register('promote@example.test')).json();
      await ctx.prisma.membership.create({
        data: { societyId: session.society.id, userId: session.user.id, role: 'ALLENATORE' },
      });
      const renewed: Session = (await refresh(session.refreshToken)).json();
      expect(renewed.roles.sort()).toEqual(['ADMIN', 'ALLENATORE']);
    });

    it('stops refreshing once the membership is gone', async () => {
      const session: Session = (await register('removed@example.test')).json();
      await ctx.prisma.membership.deleteMany({ where: { userId: session.user.id } });
      expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    });

    it('stores only a hash of the refresh token', async () => {
      const session: Session = (await register('hashed@example.test')).json();
      const stored = await ctx.prisma.refreshToken.findMany({ where: { userId: session.user.id } });
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(hashToken(session.refreshToken));
      expect(stored[0]?.tokenHash).not.toBe(session.refreshToken);
    });
  });

  describe('logout', () => {
    it('revokes the session and is idempotent', async () => {
      const session: Session = (await register('logout@example.test')).json();
      const first = await ctx.app.inject({ method: 'POST', url: `${API}/auth/logout`, payload: { refreshToken: session.refreshToken } });
      expect(first.statusCode).toBe(204);
      expect((await refresh(session.refreshToken)).statusCode).toBe(401);
      const again = await ctx.app.inject({ method: 'POST', url: `${API}/auth/logout`, payload: { refreshToken: session.refreshToken } });
      expect(again.statusCode).toBe(204);
    });
  });
});

describe('authentication rate limiting', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX: '3' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('answers 429 with a problem document after too many credential attempts', async () => {
    const attempt = () =>
      ctx.app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email: 'a@example.test', password: 'x' } });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await attempt()).statusCode);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    const blocked = await attempt();
    expect(blocked.headers['content-type']).toContain('application/problem+json');
    expect(blocked.json()).toMatchObject({ status: 429, code: 'rate_limited' });
  });
});
