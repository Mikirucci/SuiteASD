import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

describe('POST /teams/:id/members (add athletes to a team in one request)', () => {
  let ctx: TestContext;
  let societyId: string;
  let teamId: string;
  let memberIds: string[];
  let outsider: Actor;
  let foreignMemberId: string;
  const actors = {} as Record<Role, Actor>;

  const add = (actor: Actor | null, id: string, payload: object) =>
    ctx.app.inject({ method: 'POST', url: `${API}/teams/${id}/members`, headers: actor?.headers, payload });
  const inTeam = (id = teamId) =>
    ctx.prisma.teamMembership.findMany({ where: { teamId: id, leftAt: null }, select: { memberId: true } });

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aggiunta ASD')).id;
    const otherSocietyId = (await createSociety(ctx, 'Altra Aggiunta ASD')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
    teamId = (await createTeam(ctx, societyId, 'Under 15')).id;
    memberIds = [];
    for (const lastName of ['Rossi', 'Bianchi', 'Verdi']) {
      memberIds.push((await createMember(ctx, societyId, { firstName: 'Atleta', lastName })).id);
    }
    foreignMemberId = (await createMember(ctx, otherSocietyId, { firstName: 'Altro', lastName: 'Atleta' })).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('requires a token and the permission to write teams', async () => {
    expect((await add(null, teamId, { memberIds: [memberIds[0]] })).statusCode).toBe(401);
    for (const role of ROLES) {
      const expected = role === 'ADMIN' || role === 'SEGRETERIA' ? 200 : 403;
      const response = await add(actors[role], teamId, { memberIds: [] });
      // An empty list is refused by validation only for those who may write; the others never get that far
      expect(response.statusCode, role).toBe(expected === 200 ? 422 : 403);
    }
  });

  it('adds the chosen members and counts them in the team', async () => {
    const response = await add(actors.SEGRETERIA, teamId, { memberIds: [memberIds[0], memberIds[1]] });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ added: 2, alreadyInTeam: 0 });
    expect((await inTeam()).map((row) => row.memberId).sort()).toEqual([memberIds[0], memberIds[1]].sort());
    const team = await ctx.app.inject({ method: 'GET', url: `${API}/teams/${teamId}`, headers: actors.ADMIN.headers });
    expect(team.json()).toMatchObject({ membersCount: 2 });
  });

  it('leaves those already inside as they are and adds only the new ones', async () => {
    const response = await add(actors.ADMIN, teamId, { memberIds: [memberIds[1], memberIds[2], memberIds[2]] });
    expect(response.json()).toEqual({ added: 1, alreadyInTeam: 1 });
    expect(await inTeam()).toHaveLength(3);
    expect(await ctx.prisma.teamMembership.count({ where: { teamId } })).toBe(3);
  });

  it('brings back a member who had left the team instead of duplicating the row', async () => {
    await ctx.prisma.teamMembership.updateMany({ where: { teamId, memberId: memberIds[0] }, data: { leftAt: new Date() } });
    expect(await inTeam()).toHaveLength(2);
    const response = await add(actors.ADMIN, teamId, { memberIds: [memberIds[0]] });
    expect(response.json()).toEqual({ added: 1, alreadyInTeam: 0 });
    expect(await inTeam()).toHaveLength(3);
    expect(await ctx.prisma.teamMembership.count({ where: { teamId, memberId: memberIds[0] } })).toBe(1);
  });

  it('validates the body', async () => {
    expect((await add(actors.ADMIN, teamId, {})).statusCode).toBe(422);
    expect((await add(actors.ADMIN, teamId, { memberIds: [] })).statusCode).toBe(422);
    expect((await add(actors.ADMIN, teamId, { memberIds: Array.from({ length: 101 }, (_, i) => `m${i}`) })).statusCode).toBe(422);
  });

  it('answers 404 for an unknown team or an unknown member, without adding anyone', async () => {
    const other = (await createTeam(ctx, societyId, 'Under 17')).id;
    expect((await add(actors.ADMIN, 'does-not-exist', { memberIds: [memberIds[0]] })).statusCode).toBe(404);
    expect((await add(actors.ADMIN, other, { memberIds: [memberIds[0], 'does-not-exist'] })).statusCode).toBe(404);
    expect(await inTeam(other)).toHaveLength(0);
  });

  it('never crosses the society boundary, in either direction', async () => {
    const other = (await createTeam(ctx, societyId, 'Under 19')).id;
    expect((await add(actors.ADMIN, other, { memberIds: [foreignMemberId] })).statusCode).toBe(404);
    expect((await add(outsider, teamId, { memberIds: [memberIds[0]] })).statusCode).toBe(404);
    expect(await inTeam(other)).toHaveLength(0);
    expect(await ctx.prisma.teamMembership.count({ where: { memberId: foreignMemberId } })).toBe(0);
  });
});
