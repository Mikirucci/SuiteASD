import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../prisma/seed/context.js';
import { runSeed } from '../prisma/seed/run.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';

describe('demo seed (SPEC section 6)', () => {
  let ctx: TestContext;
  let societyId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await runSeed(ctx.prisma, ctx.app.passwords)).societyId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates Aquile Volley with 118 members and the six teams', async () => {
    expect(await ctx.prisma.member.count({ where: { societyId } })).toBe(118);
    const teams = await ctx.prisma.team.findMany({ where: { societyId }, orderBy: { name: 'asc' } });
    expect(teams.map((team) => team.name)).toEqual(['Prima Divisione', 'Serie D', 'U12', 'U14', 'U16', 'U18']);
  });

  it('places the named athletes of the SPEC in their teams and roles', async () => {
    const find = (firstName: string, lastName: string) =>
      ctx.prisma.member.findFirstOrThrow({
        where: { societyId, firstName, lastName },
        include: { teamMemberships: { include: { team: true } } },
      });
    const sara = await find('Sara', 'Conti');
    expect(sara).toMatchObject({ fieldRole: 'Libero' });
    expect(sara.teamMemberships.map((membership) => membership.team.name)).toEqual(['U16']);
    expect((await find('Giulia', 'Rossi')).teamMemberships[0]?.team.name).toBe('Serie D');
    expect((await find('Anna', 'Ferri')).teamMemberships[0]?.team.name).toBe('U18');
    expect((await find('Marta', 'Bianchi')).teamMemberships[0]?.team.name).toBe('U18');
    expect((await find('Chiara', 'Neri')).teamMemberships[0]?.team.name).toBe('U16');
    expect((await find('Elena', 'Russo')).teamMemberships[0]?.team.name).toBe('Serie D');
  });

  it('provides a working demo login for every role', async () => {
    for (const [email, role] of [
      ['admin@aquilevolley.it', 'ADMIN'],
      ['segreteria@aquilevolley.it', 'SEGRETERIA'],
      ['allenatore@aquilevolley.it', 'ALLENATORE'],
      ['staff@aquilevolley.it', 'STAFF'],
      ['atleta@aquilevolley.it', 'ATLETA'],
      ['genitore@aquilevolley.it', 'GENITORE'],
    ] as const) {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `${API}/auth/login`,
        payload: { email, password: DEMO_PASSWORD },
      });
      expect(response.statusCode, email).toBe(200);
      expect(response.json().roles, email).toEqual([role]);
    }
  });

  it('links the demo athlete to Giulia Rossi and the demo guardian to Sara Conti', async () => {
    const login = async (email: string) =>
      (await ctx.app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email, password: DEMO_PASSWORD } })).json()
        .accessToken as string;
    const athlete = await ctx.app.inject({
      method: 'GET',
      url: `${API}/me`,
      headers: { authorization: `Bearer ${await login('atleta@aquilevolley.it')}` },
    });
    expect(athlete.json().member).toMatchObject({ firstName: 'Giulia', lastName: 'Rossi' });
    const guardian = await ctx.app.inject({
      method: 'GET',
      url: `${API}/me`,
      headers: { authorization: `Bearer ${await login('genitore@aquilevolley.it')}` },
    });
    expect(guardian.json().children).toMatchObject([{ firstName: 'Sara', lastName: 'Conti', relation: 'MADRE' }]);
  });

  it('is re-runnable: seeding again replaces the demo data instead of duplicating it', async () => {
    const second = await runSeed(ctx.prisma, ctx.app.passwords);
    expect(await ctx.prisma.society.count({ where: { slug: 'aquile-volley' } })).toBe(1);
    expect(await ctx.prisma.member.count({ where: { societyId: second.societyId } })).toBe(118);
    expect(await ctx.prisma.user.count({ where: { email: { endsWith: '@aquilevolley.it' } } })).toBe(6);
  });
});
