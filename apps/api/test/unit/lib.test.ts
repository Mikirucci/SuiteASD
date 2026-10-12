import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { AppError } from '../../src/lib/errors.js';
import { cursorArgs, paginationQuerySchema, toPage } from '../../src/lib/pagination.js';
import { createPasswordHasher } from '../../src/lib/password.js';
import { applyTenant } from '../../src/lib/tenant.js';
import { generateOpaqueToken, hashToken, signAccessToken, verifyAccessToken } from '../../src/lib/tokens.js';

const config = loadConfig({ DATABASE_URL: 'file:./unit.db', JWT_SECRET: 'u'.repeat(40) });

describe('pagination helpers', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }));

  it('applies defaults and bounds to the query', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(paginationQuerySchema.parse({ limit: '10' }).limit).toBe(10);
    expect(paginationQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('fetches one extra row to learn whether another page exists', () => {
    expect(cursorArgs({ limit: 10 })).toEqual({ take: 11 });
  });

  it('returns no cursor on the last page', () => {
    expect(toPage(rows(3), { limit: 5 })).toEqual({ data: rows(3), page: { nextCursor: null, hasMore: false } });
    expect(toPage(rows(5), { limit: 5 }).page.hasMore).toBe(false);
  });

  it('round-trips the cursor of the last returned row', () => {
    const page = toPage(rows(6), { limit: 5 });
    expect(page.data).toHaveLength(5);
    expect(page.page.hasMore).toBe(true);
    const next = cursorArgs({ limit: 5, cursor: page.page.nextCursor ?? undefined });
    expect(next).toEqual({ take: 6, skip: 1, cursor: { id: 'id-4' } });
  });

  it('rejects tampered cursors with a 400', () => {
    for (const cursor of ['%%%', Buffer.from('{"nope":1}').toString('base64url'), Buffer.from('not json').toString('base64url')]) {
      expect(() => cursorArgs({ limit: 5, cursor })).toThrow(AppError);
    }
  });
});

describe('tokens', () => {
  it('signs and verifies an access token carrying tenant and roles', async () => {
    const token = await signAccessToken(config, { userId: 'u1', societyId: 's1', roles: ['ALLENATORE', 'GENITORE'] });
    expect(await verifyAccessToken(config, token)).toEqual({ userId: 'u1', societyId: 's1', roles: ['ALLENATORE', 'GENITORE'] });
  });

  it('rejects garbage, tampered tokens and unknown roles', async () => {
    const token = await signAccessToken(config, { userId: 'u1', societyId: 's1', roles: ['ADMIN'] });
    expect(await verifyAccessToken(config, 'garbage')).toBeNull();
    expect(await verifyAccessToken(config, `${token}x`)).toBeNull();
    const other = loadConfig({ DATABASE_URL: 'file:./unit.db', JWT_SECRET: 'z'.repeat(40) });
    expect(await verifyAccessToken(other, token)).toBeNull();
  });

  it('generates unguessable opaque tokens and hashes them deterministically', () => {
    const a = generateOpaqueToken();
    expect(a).not.toBe(generateOpaqueToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('password hasher', () => {
  const hasher = createPasswordHasher(1024);

  it('hashes with argon2id and verifies', async () => {
    const hash = await hasher.hash('s3cret-passphrase');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(hash, 's3cret-passphrase')).toBe(true);
    expect(await hasher.verify(hash, 'other')).toBe(false);
  });

  it('salts every hash and never throws on a malformed hash', async () => {
    expect(await hasher.hash('same')).not.toBe(await hasher.hash('same'));
    expect(await hasher.verify('not-a-hash', 'same')).toBe(false);
  });
});

describe('applyTenant', () => {
  it('ANDs the tenant filter with an existing where and keeps unique keys at the top level', () => {
    const result = applyTenant('Team', 'findUnique', { where: { id: 't1', AND: [{ name: 'x' }] } }, 's1') as {
      where: { id: string; AND: unknown[] };
    };
    expect(result.where.id).toBe('t1');
    expect(result.where.AND).toEqual([{ name: 'x' }, { societyId: 's1' }]);
  });

  it('adds a where to calls that had none', () => {
    expect(applyTenant('Team', 'findMany', undefined, 's1')).toEqual({ where: { AND: [{ societyId: 's1' }] } });
  });

  it('rejects models without a tenant column', () => {
    expect(() => applyTenant('Nope', 'findMany', {}, 's1')).toThrow(/no societyId/);
  });
});
