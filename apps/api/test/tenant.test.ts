import { readFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GLOBAL_MODELS, TENANT_MODELS, TenantViolationError, scopeToTenant } from '../src/lib/tenant.js';
import { createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam } from './helpers/factories.js';

describe('data model invariants', () => {
  const models = Prisma.dmmf.datamodel.models;

  it('gives every table a societyId, except the explicit global allowlist', () => {
    const withoutTenant = models.filter((model) => !TENANT_MODELS.has(model.name)).map((model) => model.name);
    expect(withoutTenant.sort()).toEqual([...GLOBAL_MODELS].sort());
  });

  it('indexes societyId on every tenant table', () => {
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    for (const name of TENANT_MODELS) {
      const start = schema.indexOf(`model ${name} {`);
      const body = schema.slice(start, schema.indexOf('\n}', start));
      expect(body, `${name} needs @@index([societyId, ...])`).toMatch(/@@(index|unique)\(\[societyId[,\]]/);
    }
  });

  it('keeps createdAt/updatedAt on every table (sync-friendly)', () => {
    for (const model of models) {
      const fields = model.fields.map((field) => field.name);
      expect(fields, model.name).toEqual(expect.arrayContaining(['createdAt', 'updatedAt']));
    }
  });

  it('uses no Prisma enums or scalar lists (SQLite/PostgreSQL portability)', () => {
    expect(Prisma.dmmf.datamodel.enums).toHaveLength(0);
    for (const model of models) {
      for (const field of model.fields) expect(field.isList && field.kind === 'scalar', `${model.name}.${field.name}`).toBe(false);
    }
  });
});

describe('tenant-scoped Prisma client', () => {
  let ctx: TestContext;
  let societyA: string;
  let societyB: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyA = (await createSociety(ctx, 'Tenant A')).id;
    societyB = (await createSociety(ctx, 'Tenant B')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const scoped = (societyId: string) => scopeToTenant(ctx.prisma, societyId);

  it('only sees rows of its own society', async () => {
    const own = await createTeam(ctx, societyA, 'A only');
    const foreign = await createTeam(ctx, societyB, 'B only');
    const db = scoped(societyA);
    expect((await db.team.findMany()).map((team) => team.id)).toContain(own.id);
    expect((await db.team.findMany()).map((team) => team.id)).not.toContain(foreign.id);
    expect(await db.team.findUnique({ where: { id: foreign.id } })).toBeNull();
    expect(await db.team.findFirst({ where: { id: foreign.id } })).toBeNull();
    expect(await db.team.count({ where: { id: foreign.id } })).toBe(0);
    await expect(db.team.findUniqueOrThrow({ where: { id: foreign.id } })).rejects.toThrow();
  });

  it('cannot be bypassed with an explicit societyId or OR filter', async () => {
    const foreign = await createTeam(ctx, societyB, 'Bypass target');
    const db = scoped(societyA);
    expect(await db.team.findMany({ where: { societyId: societyB } })).toEqual([]);
    expect(await db.team.findMany({ where: { OR: [{ societyId: societyB }, { id: foreign.id }] } })).toEqual([]);
  });

  it('does not update or delete foreign rows', async () => {
    const foreign = await createTeam(ctx, societyB, 'Protected');
    const db = scoped(societyA);
    expect((await db.team.updateMany({ where: { id: foreign.id }, data: { name: 'Hacked' } })).count).toBe(0);
    expect((await db.team.deleteMany({ where: { id: foreign.id } })).count).toBe(0);
    await expect(db.team.update({ where: { id: foreign.id }, data: { name: 'Hacked' } })).rejects.toThrow();
    await expect(db.team.delete({ where: { id: foreign.id } })).rejects.toThrow();
    expect(await ctx.prisma.team.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ name: 'Protected' });
  });

  it('refuses to create rows for another society and fills nothing implicitly wrong', async () => {
    const db = scoped(societyA);
    await expect(db.team.create({ data: { societyId: societyB, name: 'Smuggled' } })).rejects.toBeInstanceOf(TenantViolationError);
    await expect(
      db.team.createMany({ data: [{ societyId: societyA, name: 'ok' }, { societyId: societyB, name: 'bad' }] }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    expect(await ctx.prisma.team.count({ where: { name: { in: ['Smuggled', 'ok', 'bad'] } } })).toBe(0);
  });

  it('refuses to move an existing row to another society', async () => {
    const own = await createTeam(ctx, societyA, 'Immovable');
    const db = scoped(societyA);
    await expect(db.team.update({ where: { id: own.id }, data: { societyId: societyB } })).rejects.toBeInstanceOf(TenantViolationError);
  });

  it('scopes upsert to the tenant: a foreign row is never updated, the create branch runs in the own society', async () => {
    const foreign = await createTeam(ctx, societyB, 'Upsert target');
    const db = scoped(societyA);
    const result = await db.team.upsert({
      where: { id: foreign.id },
      create: { societyId: societyA, name: 'Upsert created' },
      update: { name: 'Upsert hacked' },
    });
    expect(result).toMatchObject({ name: 'Upsert created', societyId: societyA });
    expect(await ctx.prisma.team.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ name: 'Upsert target' });
    await expect(
      db.team.upsert({ where: { id: 'none' }, create: { societyId: societyB, name: 'Smuggled upsert' }, update: {} }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it('scopes aggregates and groupBy', async () => {
    await createMember(ctx, societyB, { fiscalCode: 'AGGRGT00A01H501A' });
    const db = scoped(societyA);
    expect(await db.member.count()).toBe(0);
    expect((await db.member.aggregate({ _count: true }))._count).toBe(0);
  });

  it('exposes only users that belong to the society and never lets the tenant client write users', async () => {
    const mine = await createActor(ctx, societyA, 'ALLENATORE');
    const theirs = await createActor(ctx, societyB, 'ALLENATORE');
    const db = scoped(societyA);
    const ids = (await db.user.findMany()).map((user) => user.id);
    expect(ids).toContain(mine.user.id);
    expect(ids).not.toContain(theirs.user.id);
    expect(await db.user.findUnique({ where: { id: theirs.user.id } })).toBeNull();
    await expect(db.user.update({ where: { id: mine.user.id }, data: { firstName: 'X' } })).rejects.toBeInstanceOf(TenantViolationError);
    await expect(db.user.deleteMany()).rejects.toBeInstanceOf(TenantViolationError);
  });

  it('exposes only the own society and never lets the tenant client create or delete societies', async () => {
    const db = scoped(societyA);
    expect((await db.society.findMany()).map((society) => society.id)).toEqual([societyA]);
    expect(await db.society.findUnique({ where: { id: societyB } })).toBeNull();
    await expect(db.society.deleteMany()).rejects.toBeInstanceOf(TenantViolationError);
    await expect(db.society.create({ data: { name: 'Clone', slug: 'clone' } })).rejects.toBeInstanceOf(TenantViolationError);
    expect((await db.society.update({ where: { id: societyA }, data: { city: 'Roma' } })).city).toBe('Roma');
  });

  it('keeps working inside interactive transactions', async () => {
    const db = scoped(societyA);
    const created = await db.$transaction(async (tx) => {
      await tx.team.create({ data: { societyId: societyA, name: 'In transaction' } });
      return tx.team.findMany({ where: { name: 'In transaction' } });
    });
    expect(created).toHaveLength(1);
    expect(await scoped(societyB).team.findMany({ where: { name: 'In transaction' } })).toEqual([]);
  });
});
