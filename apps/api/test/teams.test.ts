import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

// REFERENCE TEST SUITE for a CRUD module: authentication, role matrix, validation, conflicts,
// pagination, tenant isolation. New modules copy this file and adapt the endpoints.

describe('teams module', () => {
  let ctx: TestContext;
  let societyId: string;
  let otherSocietyId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Test')).id;
    otherSocietyId = (await createSociety(ctx, 'Altra Societa')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const post = (actor: Actor | null, payload: object) =>
    ctx.app.inject({ method: 'POST', url: `${API}/teams`, headers: actor?.headers, payload });

  describe('authentication', () => {
    it('rejects requests without a token with a 401 problem document', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: `${API}/teams` });
      expect(response.statusCode).toBe(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 401, code: 'unauthorized' });
    });

    it('rejects a token signed with another secret', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: `${API}/teams`,
        headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid' },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('authorization (role matrix)', () => {
    it.each(ROLES)('%s can list teams', async (role) => {
      const response = await ctx.app.inject({ method: 'GET', url: `${API}/teams`, headers: actors[role].headers });
      expect(response.statusCode).toBe(200);
    });

    it.each([
      ['ADMIN', 201],
      ['SEGRETERIA', 201],
      ['ALLENATORE', 403],
      ['STAFF', 403],
      ['ATLETA', 403],
      ['GENITORE', 403],
    ] as const)('%s creating a team gets %i', async (role, expected) => {
      const response = await post(actors[role], { name: `Matrix ${role}` });
      expect(response.statusCode).toBe(expected);
    });

    it('forbids update and delete to roles without teams:write', async () => {
      const team = await createTeam(ctx, societyId);
      const patch = await ctx.app.inject({
        method: 'PATCH',
        url: `${API}/teams/${team.id}`,
        headers: actors.ATLETA.headers,
        payload: { name: 'Hacked' },
      });
      const remove = await ctx.app.inject({
        method: 'DELETE',
        url: `${API}/teams/${team.id}`,
        headers: actors.ALLENATORE.headers,
      });
      expect(patch.statusCode).toBe(403);
      expect(remove.statusCode).toBe(403);
      expect(await ctx.prisma.team.findUnique({ where: { id: team.id } })).toMatchObject({ name: team.name });
    });

    it('grants a user holding several roles the union of their permissions', async () => {
      const multi = await createActor(ctx, societyId, 'ATLETA', 'SEGRETERIA');
      expect((await post(multi, { name: 'Multi role team' })).statusCode).toBe(201);
    });
  });

  describe('CRUD', () => {
    it('creates, reads, updates and deletes a team', async () => {
      const created = await post(actors.ADMIN, {
        name: 'Under 14',
        category: 'U14',
        gender: 'FEMALE',
        description: 'Squadra giovanile',
      });
      expect(created.statusCode).toBe(201);
      const team = created.json();
      expect(team).toMatchObject({
        name: 'Under 14',
        category: 'U14',
        sport: 'VOLLEY',
        gender: 'FEMALE',
        membersCount: 0,
      });
      expect(new Date(team.createdAt).toISOString()).toBe(team.createdAt);

      const fetched = await ctx.app.inject({ method: 'GET', url: `${API}/teams/${team.id}`, headers: actors.ALLENATORE.headers });
      expect(fetched.json()).toEqual(team);

      const updated = await ctx.app.inject({
        method: 'PATCH',
        url: `${API}/teams/${team.id}`,
        headers: actors.SEGRETERIA.headers,
        payload: { name: 'Under 14 Blu', description: null },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ name: 'Under 14 Blu', description: null, category: 'U14' });

      const removed = await ctx.app.inject({ method: 'DELETE', url: `${API}/teams/${team.id}`, headers: actors.ADMIN.headers });
      expect(removed.statusCode).toBe(204);
      expect(removed.body).toBe('');

      const gone = await ctx.app.inject({ method: 'GET', url: `${API}/teams/${team.id}`, headers: actors.ADMIN.headers });
      expect(gone.statusCode).toBe(404);
    });

    it('counts only current members in membersCount', async () => {
      const team = await createTeam(ctx, societyId);
      const current = await createMember(ctx, societyId, { firstName: 'Current' });
      const former = await createMember(ctx, societyId, { firstName: 'Former', fiscalCode: 'FRMNNA00A01H501X' });
      await ctx.prisma.teamMembership.create({ data: { societyId, teamId: team.id, memberId: current.id } });
      await ctx.prisma.teamMembership.create({
        data: { societyId, teamId: team.id, memberId: former.id, leftAt: new Date() },
      });
      const response = await ctx.app.inject({ method: 'GET', url: `${API}/teams/${team.id}`, headers: actors.ADMIN.headers });
      expect(response.json()).toMatchObject({ membersCount: 1 });
    });
  });

  describe('validation and conflicts', () => {
    it('returns 422 with field errors for an invalid body', async () => {
      const response = await post(actors.ADMIN, { name: '   ', gender: 'ROBOT' });
      expect(response.statusCode).toBe(422);
      expect(response.headers['content-type']).toContain('application/problem+json');
      const problem = response.json();
      expect(problem).toMatchObject({ status: 422, code: 'validation_error' });
      expect(problem.errors.map((error: { path: string }) => error.path)).toEqual(expect.arrayContaining(['name', 'gender']));
    });

    it('rejects an empty PATCH', async () => {
      const team = await createTeam(ctx, societyId);
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `${API}/teams/${team.id}`,
        headers: actors.ADMIN.headers,
        payload: {},
      });
      expect(response.statusCode).toBe(422);
    });

    it('returns 409 for a duplicate team name in the same society', async () => {
      await post(actors.ADMIN, { name: 'Duplicate' });
      const response = await post(actors.ADMIN, { name: 'Duplicate' });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'team_name_taken' });
    });

    it('allows the same team name in another society', async () => {
      await post(actors.ADMIN, { name: 'Shared name' });
      expect((await post(outsider, { name: 'Shared name' })).statusCode).toBe(201);
    });

    it('returns a problem document for unknown routes', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: `${API}/nope` });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'not_found' });
    });
  });

  describe('pagination and filters', () => {
    it('walks all pages with the cursor without gaps or duplicates', async () => {
      const paged = await createSociety(ctx, 'Paged ASD');
      const admin = await createActor(ctx, paged.id, 'ADMIN');
      for (const name of ['E', 'B', 'D', 'A', 'C']) await createTeam(ctx, paged.id, name);

      const names: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor ? `limit=2&cursor=${cursor}` : 'limit=2';
        const response = await ctx.app.inject({ method: 'GET', url: `${API}/teams?${query}`, headers: admin.headers });
        expect(response.statusCode).toBe(200);
        const body: { data: { name: string }[]; page: { nextCursor: string | null; hasMore: boolean } } = response.json();
        names.push(...body.data.map((team) => team.name));
        expect(body.page.hasMore).toBe(body.page.nextCursor !== null);
        cursor = body.page.nextCursor;
        pages += 1;
      } while (cursor);

      expect(names).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(pages).toBe(3);
    });

    it('rejects a malformed cursor and an out-of-range limit', async () => {
      const badCursor = await ctx.app.inject({ method: 'GET', url: `${API}/teams?cursor=not-a-cursor`, headers: actors.ADMIN.headers });
      expect(badCursor.statusCode).toBe(400);
      expect(badCursor.json()).toMatchObject({ code: 'invalid_cursor' });
      const badLimit = await ctx.app.inject({ method: 'GET', url: `${API}/teams?limit=1000`, headers: actors.ADMIN.headers });
      expect(badLimit.statusCode).toBe(422);
    });

    it('filters by name substring and category', async () => {
      const filtered = await createSociety(ctx, 'Filter ASD');
      const admin = await createActor(ctx, filtered.id, 'ADMIN');
      await ctx.prisma.team.createMany({
        data: [
          { societyId: filtered.id, name: 'Serie D', category: 'SERIE_D' },
          { societyId: filtered.id, name: 'Under 16', category: 'U16' },
          { societyId: filtered.id, name: 'Under 18', category: 'U18' },
        ],
      });
      const byName = await ctx.app.inject({ method: 'GET', url: `${API}/teams?q=Under`, headers: admin.headers });
      expect(byName.json().data.map((team: { name: string }) => team.name)).toEqual(['Under 16', 'Under 18']);
      const byCategory = await ctx.app.inject({ method: 'GET', url: `${API}/teams?category=SERIE_D`, headers: admin.headers });
      expect(byCategory.json().data).toHaveLength(1);
    });
  });

  describe('tenant isolation', () => {
    it('never lists teams of another society', async () => {
      const own = await createTeam(ctx, societyId, 'Visible only to Aquile');
      const response = await ctx.app.inject({ method: 'GET', url: `${API}/teams?limit=100`, headers: outsider.headers });
      const ids = response.json().data.map((team: { id: string }) => team.id);
      expect(ids).not.toContain(own.id);
    });

    it('answers 404 (not 403) when reading, updating or deleting a foreign team', async () => {
      const foreign = await createTeam(ctx, societyId, 'Foreign team');
      const read = await ctx.app.inject({ method: 'GET', url: `${API}/teams/${foreign.id}`, headers: outsider.headers });
      const update = await ctx.app.inject({
        method: 'PATCH',
        url: `${API}/teams/${foreign.id}`,
        headers: outsider.headers,
        payload: { name: 'Stolen' },
      });
      const remove = await ctx.app.inject({ method: 'DELETE', url: `${API}/teams/${foreign.id}`, headers: outsider.headers });
      expect([read.statusCode, update.statusCode, remove.statusCode]).toEqual([404, 404, 404]);
      expect(await ctx.prisma.team.findUnique({ where: { id: foreign.id } })).toMatchObject({ name: 'Foreign team' });
    });

    it('creates the team in the token society even if the body names another one', async () => {
      const response = await post(outsider, { name: 'Injected', societyId });
      expect(response.statusCode).toBe(201);
      const stored = await ctx.prisma.team.findUniqueOrThrow({ where: { id: response.json().id } });
      expect(stored.societyId).toBe(otherSocietyId);
    });

    it('refuses to attach a season that belongs to another society', async () => {
      const season = await ctx.prisma.season.create({
        data: { societyId, name: '2026/27', startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
      });
      const response = await post(outsider, { name: 'Cross tenant season', seasonId: season.id });
      expect(response.statusCode).toBe(404);
      const own = await post(actors.ADMIN, { name: 'Own season', seasonId: season.id });
      expect(own.statusCode).toBe(201);
    });
  });
});
