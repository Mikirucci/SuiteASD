import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import type { EmailMessage, EmailResult, EmailTransport } from '../src/lib/email.js';
import { hashToken, verifyAccessToken } from '../src/lib/tokens.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { TEST_PASSWORD, createActor, createSociety, type Actor } from './helpers/factories.js';

interface Session {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email: string };
  society: { id: string; name: string };
  roles: string[];
}

const WEB_BASE_URL = 'https://app.example.test';
const NEW_PASSWORD = 'N3w-passw0rd!';

// Records every message and answers with the configured result (default: accepted).
function fakeTransport(result: () => EmailResult | Promise<EmailResult> = () => ({ ok: true, providerId: 'p1' })) {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    provider: 'fake',
    async send(message) {
      sent.push(message);
      return result();
    },
  };
  return { transport, sent };
}

function tokenFrom(message: EmailMessage): string {
  const match = /accesso-link\?token=([^\s]+)/.exec(message.text);
  if (!match?.[1]) throw new Error('no magic link in the email');
  return decodeURIComponent(match[1]);
}

describe('magic link login', () => {
  let ctx: TestContext;
  const mail = fakeTransport();

  beforeAll(async () => {
    ctx = await createTestContext({ WEB_BASE_URL: `${WEB_BASE_URL}/` }, { email: mail.transport });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const requestLink = (email: string) =>
    ctx.app.inject({ method: 'POST', url: `${API}/auth/magic-link/request`, payload: { email } });
  const consume = (token: string, societyId?: string) =>
    ctx.app.inject({ method: 'POST', url: `${API}/auth/magic-link/consume`, payload: { token, societyId } });
  const me = (accessToken: string) =>
    ctx.app.inject({ method: 'GET', url: `${API}/me`, headers: { authorization: `Bearer ${accessToken}` } });
  const refresh = (refreshToken: string) =>
    ctx.app.inject({ method: 'POST', url: `${API}/auth/refresh`, payload: { refreshToken } });
  const login = (email: string, password: string) =>
    ctx.app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email, password } });
  const setPassword = (accessToken: string, payload: object) =>
    ctx.app.inject({
      method: 'PUT',
      url: `${API}/auth/password`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload,
    });

  // Waits for the fire-and-forget delivery and returns the newest email sent to `email`.
  async function requestAndRead(email: string): Promise<{ token: string; message: EmailMessage }> {
    const before = mail.sent.length;
    expect((await requestLink(email)).statusCode).toBe(202);
    await vi.waitFor(() => expect(mail.sent.length).toBe(before + 1));
    const message = mail.sent[before];
    if (!message) throw new Error('email not sent');
    return { token: tokenFrom(message), message };
  }

  async function newUser(...roles: Parameters<typeof createActor>[2][]): Promise<Actor> {
    const society = await createSociety(ctx);
    return createActor(ctx, society.id, ...roles);
  }

  describe('requesting a link', () => {
    it('answers 202 with the same body for known, unknown, disabled and society-less accounts', async () => {
      const known = await newUser('ADMIN');
      const disabled = await newUser('ADMIN');
      await ctx.prisma.user.update({ where: { id: disabled.user.id }, data: { isActive: false } });
      const orphan = await ctx.prisma.user.create({
        data: { email: 'orphan@example.test', passwordHash: 'x', firstName: 'O', lastName: 'R' },
      });

      const responses = await Promise.all(
        [known.user.email, 'nobody@example.test', disabled.user.email, orphan.email].map((email) => requestLink(email)),
      );
      for (const response of responses) {
        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({ status: 'accepted' });
        expect(response.body).toBe(responses[0]?.body);
      }
      expect(await ctx.prisma.loginToken.count({ where: { userId: { in: [disabled.user.id, orphan.id] } } })).toBe(0);
    });

    it('emails only accounts that can sign in, with a link to the web app', async () => {
      const known = await newUser('ADMIN');
      const disabled = await newUser('ADMIN');
      await ctx.prisma.user.update({ where: { id: disabled.user.id }, data: { isActive: false } });
      const before = mail.sent.length;

      await requestLink('nobody@example.test');
      await requestLink(disabled.user.email);
      const { token, message } = await requestAndRead(known.user.email.toUpperCase());

      expect(mail.sent).toHaveLength(before + 1);
      expect(message.to).toBe(known.user.email);
      expect(message.subject).toBe('Il tuo link di accesso a SuiteASD');
      expect(message.text).toContain(`${WEB_BASE_URL}/accesso-link?token=${token}`);
      expect(message.text).toContain('15 minuti');
      const record = await ctx.prisma.loginToken.findFirstOrThrow({ where: { userId: known.user.id } });
      expect(message.idempotencyKey).toBe(`magic-link:${record.id}`);
    });

    it('stores only the SHA-256 of a 256-bit token that expires in 15 minutes', async () => {
      const actor = await newUser('ADMIN');
      const startedAt = Date.now();
      const { token } = await requestAndRead(actor.user.email);

      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      const rows = await ctx.prisma.loginToken.findMany({ where: { userId: actor.user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(rows)).not.toContain(token);
      const ttl = (rows[0]?.expiresAt.getTime() ?? 0) - startedAt;
      expect(ttl).toBeGreaterThan(14 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);
    });

    it('keeps one live link per user: a newer request invalidates the previous one', async () => {
      const actor = await newUser('ADMIN');
      const first = await requestAndRead(actor.user.email);
      const second = await requestAndRead(actor.user.email);

      expect(second.token).not.toBe(first.token);
      expect(await ctx.prisma.loginToken.count({ where: { userId: actor.user.id } })).toBe(1);
      expect((await consume(first.token)).statusCode).toBe(401);
      expect((await consume(second.token)).statusCode).toBe(200);
    });

    it('rejects a malformed email with a validation error', async () => {
      const response = await requestLink('not-an-email');
      expect(response.statusCode).toBe(422);
    });

    it('still answers 202 when the provider rejects the message or throws', async () => {
      const rejecting = fakeTransport(() => ({ ok: false, error: 'boom', retryable: false }));
      const throwing = fakeTransport(() => Promise.reject(new Error('socket hang up')));
      for (const failing of [rejecting, throwing]) {
        const failingCtx = await createTestContext({}, { email: failing.transport });
        try {
          const society = await createSociety(failingCtx);
          const user = await createActor(failingCtx, society.id, 'ADMIN');
          const response = await failingCtx.app.inject({
            method: 'POST',
            url: `${API}/auth/magic-link/request`,
            payload: { email: user.user.email },
          });
          expect(response.statusCode).toBe(202);
          await vi.waitFor(() => expect(failing.sent).toHaveLength(1));
        } finally {
          await failingCtx.close();
        }
      }
    });

    it('answers 202 and records the link without sending anything when no provider is configured', async () => {
      const bare = await createTestContext();
      try {
        const society = await createSociety(bare);
        const user = await createActor(bare, society.id, 'ADMIN');
        const response = await bare.app.inject({
          method: 'POST',
          url: `${API}/auth/magic-link/request`,
          payload: { email: user.user.email },
        });
        expect(response.statusCode).toBe(202);
        expect(await bare.prisma.loginToken.count({ where: { userId: user.user.id } })).toBe(1);
      } finally {
        await bare.close();
      }
    });
  });

  describe('consuming a link', () => {
    it('opens a session shaped like the login one', async () => {
      const actor = await newUser('ADMIN', 'ALLENATORE');
      const { token } = await requestAndRead(actor.user.email);

      const response = await consume(token);
      expect(response.statusCode).toBe(200);
      const session: Session = response.json();
      expect(session).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: ctx.config.ACCESS_TOKEN_TTL_SECONDS,
        user: { id: actor.user.id, email: actor.user.email },
        society: { id: actor.societyId },
      });
      expect(session.roles.sort()).toEqual(['ADMIN', 'ALLENATORE']);
      expect(Object.keys(session).sort()).toEqual(
        Object.keys((await login(actor.user.email, TEST_PASSWORD)).json<Session>()).sort(),
      );

      expect((await me(session.accessToken)).statusCode).toBe(200);
      expect((await refresh(session.refreshToken)).statusCode).toBe(200);
      const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: actor.user.id } });
      expect(stored.lastLoginAt).not.toBeNull();
    });

    it('is single use', async () => {
      const actor = await newUser('ADMIN');
      const { token } = await requestAndRead(actor.user.email);
      expect((await consume(token)).statusCode).toBe(200);

      const replay = await consume(token);
      expect(replay.statusCode).toBe(401);
      expect(replay.json()).toMatchObject({ code: 'invalid_magic_link' });
      expect(await ctx.prisma.loginToken.count({ where: { userId: actor.user.id } })).toBe(0);
    });

    it('lets exactly one of several concurrent requests win', async () => {
      const actor = await newUser('ADMIN');
      const { token } = await requestAndRead(actor.user.email);

      const responses = await Promise.all(Array.from({ length: 6 }, () => consume(token)));
      expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(1);
      expect(responses.filter((response) => response.statusCode === 401)).toHaveLength(5);
      const sessions = await ctx.prisma.refreshToken.count({ where: { userId: actor.user.id } });
      expect(sessions).toBe(1);
    });

    it('rejects an expired link', async () => {
      const actor = await newUser('ADMIN');
      const { token } = await requestAndRead(actor.user.email);
      await ctx.prisma.loginToken.updateMany({
        where: { userId: actor.user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const response = await consume(token);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'invalid_magic_link' });
    });

    it('answers wrong, tampered, expired and used tokens with the very same error', async () => {
      const actor = await newUser('ADMIN');
      const { token } = await requestAndRead(actor.user.email);
      const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
      const wrong = await consume('x'.repeat(43));
      const bodies = [
        wrong,
        await consume(tampered),
        await consume(token.toUpperCase() === token ? token.toLowerCase() : token.toUpperCase()),
        await consume(`${token}extra`),
      ].map((response) => ({ status: response.statusCode, body: response.json() }));
      for (const entry of bodies) {
        expect(entry.status).toBe(401);
        expect(entry.body).toMatchObject({ code: 'invalid_magic_link', detail: 'The login link is invalid or has expired' });
      }
      // None of those attempts consumed the genuine link.
      expect((await consume(token)).statusCode).toBe(200);
      const used = await consume(token);
      expect({ status: used.statusCode, detail: used.json().detail }).toEqual({
        status: 401,
        detail: 'The login link is invalid or has expired',
      });
    });

    it('validates the body', async () => {
      expect((await ctx.app.inject({ method: 'POST', url: `${API}/auth/magic-link/consume`, payload: {} })).statusCode).toBe(422);
      expect((await consume('')).statusCode).toBe(422);
    });

    it('refuses an account disabled after the link was issued', async () => {
      const actor = await newUser('ADMIN');
      const { token } = await requestAndRead(actor.user.email);
      await ctx.prisma.user.update({ where: { id: actor.user.id }, data: { isActive: false } });
      expect((await consume(token)).statusCode).toBe(401);
    });

    it('follows the login rules for accounts in several societies', async () => {
      const first = await newUser('ADMIN');
      const secondSociety = await createSociety(ctx, 'Seconda ASD');
      await ctx.prisma.membership.create({
        data: {
          societyId: secondSociety.id,
          userId: first.user.id,
          role: 'SEGRETERIA',
          createdAt: new Date(Date.now() + 60_000),
        },
      });

      const byDefault: Session = (await consume((await requestAndRead(first.user.email)).token)).json();
      expect(byDefault.society.id).toBe(first.societyId);
      expect(byDefault.roles).toEqual(['ADMIN']);

      const chosen: Session = (await consume((await requestAndRead(first.user.email)).token, secondSociety.id)).json();
      expect(chosen.society.id).toBe(secondSociety.id);
      expect(chosen.roles).toEqual(['SEGRETERIA']);
    });

    it('does not burn the link when the requested society is not one of the account', async () => {
      const actor = await newUser('ADMIN');
      const stranger = await createSociety(ctx, 'Altra ASD');
      const { token } = await requestAndRead(actor.user.email);

      const refused = await consume(token, stranger.id);
      expect(refused.statusCode).toBe(401);
      expect(refused.json()).toMatchObject({ code: 'invalid_magic_link' });
      expect((await consume(token)).statusCode).toBe(200);
    });

    it('marks only this access token as coming from a magic link', async () => {
      const actor = await newUser('ADMIN');
      const session: Session = (await consume((await requestAndRead(actor.user.email)).token)).json();
      expect(await verifyAccessToken(ctx.config, session.accessToken)).toMatchObject({ authMethod: 'magic_link' });

      const renewed: Session = (await refresh(session.refreshToken)).json();
      expect((await verifyAccessToken(ctx.config, renewed.accessToken))?.authMethod).toBeUndefined();
      const loggedIn: Session = (await login(actor.user.email, TEST_PASSWORD)).json();
      expect((await verifyAccessToken(ctx.config, loggedIn.accessToken))?.authMethod).toBeUndefined();
    });
  });

  describe('setting a password', () => {
    it('requires authentication', async () => {
      const response = await ctx.app.inject({ method: 'PUT', url: `${API}/auth/password`, payload: { newPassword: NEW_PASSWORD } });
      expect(response.statusCode).toBe(401);
    });

    it('needs no current password right after a magic-link login, signs out the other sessions and keeps the caller in', async () => {
      const actor = await newUser('ADMIN');
      const phone: Session = (await login(actor.user.email, TEST_PASSWORD)).json();
      const laptop: Session = (await login(actor.user.email, TEST_PASSWORD)).json();
      const viaLink: Session = (await consume((await requestAndRead(actor.user.email)).token)).json();
      await requestAndRead(actor.user.email); // a pending link must not survive the change

      const response = await setPassword(viaLink.accessToken, { newPassword: NEW_PASSWORD });
      expect(response.statusCode).toBe(200);
      const fresh: Session = response.json();
      expect(fresh).toMatchObject({ user: { id: actor.user.id }, society: { id: actor.societyId }, roles: ['ADMIN'] });

      expect((await refresh(phone.refreshToken)).statusCode).toBe(401);
      expect((await refresh(laptop.refreshToken)).statusCode).toBe(401);
      expect((await refresh(viaLink.refreshToken)).statusCode).toBe(401);
      expect((await refresh(fresh.refreshToken)).statusCode).toBe(200);
      expect(await ctx.prisma.loginToken.count({ where: { userId: actor.user.id } })).toBe(0);

      expect((await login(actor.user.email, TEST_PASSWORD)).statusCode).toBe(401);
      expect((await login(actor.user.email, NEW_PASSWORD)).statusCode).toBe(200);
      const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: actor.user.id } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored.passwordHash).not.toContain(NEW_PASSWORD);
    });

    it('revokes the sessions of every society of the account', async () => {
      const actor = await newUser('ADMIN');
      const otherSociety = await createSociety(ctx, 'Seconda ASD');
      await ctx.prisma.membership.create({ data: { societyId: otherSociety.id, userId: actor.user.id, role: 'ATLETA' } });
      const elsewhere: Session = (
        await ctx.app.inject({
          method: 'POST',
          url: `${API}/auth/login`,
          payload: { email: actor.user.email, password: TEST_PASSWORD, societyId: otherSociety.id },
        })
      ).json();
      const viaLink: Session = (await consume((await requestAndRead(actor.user.email)).token)).json();

      expect((await setPassword(viaLink.accessToken, { newPassword: NEW_PASSWORD })).statusCode).toBe(200);
      expect((await refresh(elsewhere.refreshToken)).statusCode).toBe(401);
    });

    it('requires the current password in a normal session', async () => {
      const actor = await newUser('ADMIN');
      const session: Session = (await login(actor.user.email, TEST_PASSWORD)).json();

      const missing = await setPassword(session.accessToken, { newPassword: NEW_PASSWORD });
      expect(missing.statusCode).toBe(422);
      expect(missing.json()).toMatchObject({ code: 'current_password_required' });

      const wrong = await setPassword(session.accessToken, { newPassword: NEW_PASSWORD, currentPassword: 'Wrong-pass1!' });
      expect(wrong.statusCode).toBe(422);
      expect(wrong.json()).toMatchObject({ code: 'invalid_current_password' });
      expect((await login(actor.user.email, TEST_PASSWORD)).statusCode).toBe(200);

      const ok = await setPassword(session.accessToken, { newPassword: NEW_PASSWORD, currentPassword: TEST_PASSWORD });
      expect(ok.statusCode).toBe(200);
      expect((await refresh(session.refreshToken)).statusCode).toBe(401);
      expect((await login(actor.user.email, NEW_PASSWORD)).statusCode).toBe(200);
    });

    it('requires the current password again once the magic-link access token has been refreshed away', async () => {
      const actor = await newUser('ADMIN');
      const viaLink: Session = (await consume((await requestAndRead(actor.user.email)).token)).json();
      const renewed: Session = (await refresh(viaLink.refreshToken)).json();
      const response = await setPassword(renewed.accessToken, { newPassword: NEW_PASSWORD });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'current_password_required' });
    });

    it('applies the register password rules', async () => {
      const actor = await newUser('ADMIN');
      const viaLink: Session = (await consume((await requestAndRead(actor.user.email)).token)).json();
      for (const newPassword of ['short', 'x'.repeat(129)]) {
        expect((await setPassword(viaLink.accessToken, { newPassword })).statusCode).toBe(422);
      }
      expect((await setPassword(viaLink.accessToken, {})).statusCode).toBe(422);
      expect((await login(actor.user.email, TEST_PASSWORD)).statusCode).toBe(200);
    });

    it('refuses a disabled account', async () => {
      const actor = await newUser('ADMIN');
      const session: Session = (await login(actor.user.email, TEST_PASSWORD)).json();
      await ctx.prisma.user.update({ where: { id: actor.user.id }, data: { isActive: false } });
      const response = await setPassword(session.accessToken, { newPassword: NEW_PASSWORD, currentPassword: TEST_PASSWORD });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('logging', () => {
    // Runs the service against a logger whose output is captured.
    function probeService(email: EmailTransport | null) {
      const lines: string[] = [];
      const probe = Fastify({ logger: { level: 'trace', stream: { write: (line: string) => void lines.push(line) } } });
      const service = createAuthService({
        prisma: ctx.prisma,
        config: ctx.config,
        passwords: ctx.app.passwords,
        email,
        log: probe.log,
      });
      return { service, lines };
    }

    it('records the delivery without ever writing the token or the link', async () => {
      const actor = await newUser('ADMIN');
      const ok = fakeTransport();
      const failing = fakeTransport(() => ({ ok: false, error: 'provider said no', retryable: false }));
      const throwing = fakeTransport(() => Promise.reject(new Error('socket hang up')));

      for (const mailbox of [ok, failing, throwing]) {
        const { service, lines } = probeService(mailbox.transport);
        await service.requestMagicLink(actor.user.email);
        await vi.waitFor(() => expect(mailbox.sent).toHaveLength(1));
        await vi.waitFor(() => expect(lines.some((line) => line.includes('Magic link email'))).toBe(true));
        const [message] = mailbox.sent;
        if (!message) throw new Error('no email was sent');
        const token = tokenFrom(message);
        const output = lines.join('');
        expect(output).not.toContain(token);
        expect(output).not.toContain('accesso-link');
        expect(output).not.toContain(hashToken(token));
        expect(output).not.toContain(actor.user.email);
      }
    });

    it('logs the skipped delivery when no provider is configured', async () => {
      const actor = await newUser('ADMIN');
      const { service, lines } = probeService(null);
      await service.requestMagicLink(actor.user.email);

      const output = lines.join('');
      expect(output).toContain('Magic link not sent: no email provider configured');
      const stored = await ctx.prisma.loginToken.findFirstOrThrow({ where: { userId: actor.user.id } });
      expect(output).not.toContain(stored.tokenHash);
      expect(output).not.toContain(actor.user.email);
    });
  });
});

describe.each([
  ['POST', '/auth/magic-link/request', { email: 'a@example.test' }, 202],
  ['POST', '/auth/magic-link/consume', { token: 'nope' }, 401],
  ['PUT', '/auth/password', { newPassword: NEW_PASSWORD, currentPassword: TEST_PASSWORD }, 200],
] as const)('rate limit of %s %s', (method, path, payload, firstStatus) => {
  let ctx: TestContext;
  let actor: Actor;

  beforeAll(async () => {
    ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX: '3' });
    actor = await createActor(ctx, (await createSociety(ctx)).id, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('answers 429 with a problem document after too many attempts', async () => {
    const attempt = () =>
      ctx.app.inject({
        method,
        url: `${API}${path}`,
        headers: path === '/auth/password' ? actor.headers : {},
        payload,
      });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await attempt()).statusCode);
    expect(statuses.slice(3)).toEqual([429, 429]);
    expect(statuses[0]).toBe(firstStatus);
    const blocked = await attempt();
    expect(blocked.headers['content-type']).toContain('application/problem+json');
    expect(blocked.json()).toMatchObject({ status: 429, code: 'rate_limited' });
  });
});

describe('WEB_BASE_URL configuration', () => {
  const base = { DATABASE_URL: 'file:./x.db', JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret' };

  it('defaults to the local web app and drops trailing slashes', () => {
    expect(loadConfig(base).WEB_BASE_URL).toBe('http://localhost:3000');
    expect(loadConfig({ ...base, WEB_BASE_URL: 'https://app.asd.test//' }).WEB_BASE_URL).toBe('https://app.asd.test');
  });

  it('accepts only http(s) URLs', () => {
    for (const value of ['not a url', 'javascript:alert(1)', 'ftp://asd.test', '']) {
      expect(() => loadConfig({ ...base, WEB_BASE_URL: value })).toThrow(/WEB_BASE_URL/);
    }
  });
});
