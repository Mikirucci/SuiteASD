import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './app.js';
import { createActor, createSociety, type Actor } from './factories.js';

// Shared contract suite for the plain CRUD modules (same checks as test/teams.test.ts): authentication, role matrix,
// lifecycle, validation, pagination, tenant isolation. Module-specific rules live in the module's own test file.

export interface CrudSuiteEnv {
  ctx: TestContext;
  societyId: string;
  // Distinct per call, so payloads never collide on unique columns.
  n: number;
}

export interface CrudSuiteConfig {
  title: string;
  path: string;
  readRoles: readonly Role[];
  writeRoles: readonly Role[];
  // A valid creation body; may create prerequisite rows (season, member...) in the given society.
  createPayload(env: CrudSuiteEnv): Promise<object> | object;
  // Expected subset of the creation response, derived from the payload sent.
  expectedFromPayload?(payload: object): object;
  // Invalid body and the fields the 422 problem must point at.
  invalidPayload: object;
  invalidFields: readonly string[];
  // A valid PATCH body and the subset of the response that must reflect it.
  patch: { payload: object; expected: object };
}

export function describeCrudModule(config: CrudSuiteConfig, extra?: (get: () => CrudSuiteHandles) => void): void {
  let ctx: TestContext;
  let societyId: string;
  let counter = 0;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;

  const handles = (): CrudSuiteHandles => ({ ctx, societyId, actors, outsider, url: config.path });
  const payload = async (): Promise<object> => {
    counter += 1;
    return config.createPayload({ ctx, societyId, n: counter });
  };
  const url = (id = '') => `${API}${config.path}${id ? `/${id}` : ''}`;
  const send = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', actor: Actor | null, path: string, body?: object) =>
    ctx.app.inject({ method, url: path, headers: actor?.headers, payload: body });
  const createAs = async (actor: Actor) => send('POST', actor, url(), await payload());

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Test')).id;
    const otherSocietyId = (await createSociety(ctx, 'Altra Societa')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe(`${config.title} (CRUD contract)`, () => {
    it('answers 401 with a problem document when no token is sent', async () => {
      const response = await send('GET', null, url());
      expect(response.statusCode).toBe(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it.each(ROLES)('%s listing gets the status of the role matrix', async (role) => {
      const response = await send('GET', actors[role], url());
      expect(response.statusCode).toBe(config.readRoles.includes(role) ? 200 : 403);
    });

    it.each(ROLES)('%s creating gets the status of the role matrix', async (role) => {
      const response = await createAs(actors[role]);
      expect(response.statusCode).toBe(config.writeRoles.includes(role) ? 201 : 403);
    });

    it('forbids update and delete to roles without write permission', async () => {
      const writer = actors[config.writeRoles[0] ?? 'ADMIN'];
      const item = (await createAs(writer)).json();
      for (const role of ROLES.filter((candidate) => !config.writeRoles.includes(candidate))) {
        const patch = await send('PATCH', actors[role], url(item.id), config.patch.payload);
        const remove = await send('DELETE', actors[role], url(item.id));
        expect([patch.statusCode, remove.statusCode], role).toEqual([403, 403]);
      }
      expect((await send('GET', writer, url(item.id))).statusCode).toBe(200);
    });

    it('creates, reads, updates and deletes an item', async () => {
      const writer = actors[config.writeRoles[0] ?? 'ADMIN'];
      const reader = actors[config.readRoles[0] ?? 'ADMIN'];
      const body = await payload();
      const created = await send('POST', writer, url(), body);
      expect(created.statusCode).toBe(201);
      const item = created.json();
      expect(item).toMatchObject(config.expectedFromPayload ? config.expectedFromPayload(body) : body);
      expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt);

      expect((await send('GET', reader, url(item.id))).json()).toEqual(item);

      const updated = await send('PATCH', writer, url(item.id), config.patch.payload);
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject(config.patch.expected);

      const removed = await send('DELETE', writer, url(item.id));
      expect(removed.statusCode).toBe(204);
      expect(removed.body).toBe('');
      expect((await send('GET', writer, url(item.id))).statusCode).toBe(404);
      expect((await send('DELETE', writer, url(item.id))).statusCode).toBe(404);
    });

    it('returns 422 with field errors for an invalid body and for an empty PATCH', async () => {
      const writer = actors[config.writeRoles[0] ?? 'ADMIN'];
      const response = await send('POST', writer, url(), config.invalidPayload);
      expect(response.statusCode).toBe(422);
      const problem = response.json();
      expect(problem).toMatchObject({ status: 422, code: 'validation_error' });
      expect(problem.errors.map((error: { path: string }) => error.path)).toEqual(expect.arrayContaining([...config.invalidFields]));

      const item = (await createAs(writer)).json();
      expect((await send('PATCH', writer, url(item.id), {})).statusCode).toBe(422);
    });

    it('walks all pages with the cursor without gaps or duplicates', async () => {
      const paged = await createSociety(ctx, 'Paged ASD');
      const admin = await createActor(ctx, paged.id, 'ADMIN');
      const created: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        counter += 1;
        const body = await config.createPayload({ ctx, societyId: paged.id, n: counter });
        created.push((await send('POST', admin, url(), body)).json().id);
      }
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor ? `limit=2&cursor=${cursor}` : 'limit=2';
        const response = await send('GET', admin, `${url()}?${query}`);
        expect(response.statusCode).toBe(200);
        const body: { data: { id: string }[]; page: { nextCursor: string | null; hasMore: boolean } } = response.json();
        seen.push(...body.data.map((item) => item.id));
        expect(body.page.hasMore).toBe(body.page.nextCursor !== null);
        cursor = body.page.nextCursor;
        pages += 1;
      } while (cursor);
      expect(pages).toBe(3);
      expect([...seen].sort()).toEqual([...created].sort());
    });

    it('rejects a malformed cursor and an out-of-range limit', async () => {
      const reader = actors[config.readRoles[0] ?? 'ADMIN'];
      const badCursor = await send('GET', reader, `${url()}?cursor=not-a-cursor`);
      expect(badCursor.statusCode).toBe(400);
      expect(badCursor.json()).toMatchObject({ code: 'invalid_cursor' });
      expect((await send('GET', reader, `${url()}?limit=1000`)).statusCode).toBe(422);
    });

    it('never exposes items of another society: lists exclude them, reads/updates/deletes answer 404', async () => {
      const writer = actors[config.writeRoles[0] ?? 'ADMIN'];
      const foreign = (await createAs(writer)).json();

      const list = await send('GET', outsider, `${url()}?limit=100`);
      expect(list.json().data.map((item: { id: string }) => item.id)).not.toContain(foreign.id);

      const read = await send('GET', outsider, url(foreign.id));
      const update = await send('PATCH', outsider, url(foreign.id), config.patch.payload);
      const remove = await send('DELETE', outsider, url(foreign.id));
      expect([read.statusCode, update.statusCode, remove.statusCode]).toEqual([404, 404, 404]);
      expect((await send('GET', writer, url(foreign.id))).json()).toEqual(foreign);
    });

    it('creates the item in the token society even if the body names another one', async () => {
      const body = { ...(await config.createPayload({ ctx, societyId: outsider.societyId, n: (counter += 1) })), societyId };
      const response = await send('POST', outsider, url(), body);
      expect(response.statusCode).toBe(201);
      expect(response.json()).not.toHaveProperty('societyId');
      const list = await send('GET', actors[config.writeRoles[0] ?? 'ADMIN'], `${url()}?limit=100`);
      expect(list.json().data.map((item: { id: string }) => item.id)).not.toContain(response.json().id);
    });
  });

  extra?.(handles);
}

export interface CrudSuiteHandles {
  ctx: TestContext;
  societyId: string;
  actors: Record<Role, Actor>;
  outsider: Actor;
  url: string;
}
