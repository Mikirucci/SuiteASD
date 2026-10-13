import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StandingsDto } from '../src/modules/competitions/schema.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety, createTeam, type Actor } from './helpers/factories.js';

// Tournaments are competitions with kind TOURNAMENT (docs/DECISIONS.md D6): same endpoints as the leagues,
// groups are the pools of the tournament and each pool has its own standings.
describe('tournaments (competitions of kind TOURNAMENT)', () => {
  let ctx: TestContext;
  let societyId: string;
  let admin: Actor;
  let coach: Actor;
  let athlete: Actor;
  let outsider: Actor;
  let seasonId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Tornei ASD')).id;
    admin = await createActor(ctx, societyId, 'ADMIN');
    coach = await createActor(ctx, societyId, 'ALLENATORE');
    athlete = await createActor(ctx, societyId, 'ATLETA');
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altri Tornei ASD')).id, 'ADMIN');
    seasonId = (
      await ctx.prisma.season.create({
        data: { societyId, name: '2026/27', startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
      })
    ).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const call = (actor: Actor | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    ctx.app.inject({ method, url: `${API}${url}`, headers: actor?.headers, payload });

  async function createTournament(name = 'Torneo di Natale') {
    const response = await call(coach, 'POST', '/competitions', { seasonId, name, kind: 'TOURNAMENT' });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<{ id: string }>();
  }

  async function createPool(competitionId: string, name: string, teams: string[]) {
    const group = await call(coach, 'POST', `/competitions/${competitionId}/groups`, { name });
    expect(group.statusCode).toBe(201);
    const base = `/competitions/${competitionId}/groups/${group.json().id}`;
    const ids: Record<string, string> = {};
    for (const [index, team] of teams.entries()) {
      const payload = index === 0 ? { name: team, teamId: (await createTeam(ctx, societyId, `${name} ${team} ${Math.random()}`)).id } : { name: team };
      const created = await call(coach, 'POST', `${base}/teams`, payload);
      expect(created.statusCode, created.body).toBe(201);
      ids[team] = created.json().id;
    }
    const play = async (round: number, home: string, away: string, homeSets: number, awaySets: number) => {
      const match = await call(coach, 'POST', `${base}/matches`, { round, homeTeamId: ids[home], awayTeamId: ids[away] });
      expect(match.statusCode, match.body).toBe(201);
      const result = await call(coach, 'PUT', `/matches/${match.json().id}/result`, { homeSets, awaySets });
      expect(result.statusCode, result.body).toBe(200);
    };
    const standings = async () => (await call(athlete, 'GET', `${base}/standings`)).json<StandingsDto>();
    return { base, ids, play, standings };
  }

  it('creates a tournament with the volleyball rules and lists it apart from the leagues', async () => {
    const tournament = await createTournament();
    const league = await call(admin, 'POST', '/competitions', { seasonId, name: 'Campionato Serie D' });
    expect(league.json().kind).toBe('LEAGUE');

    const detail = await call(athlete, 'GET', `/competitions/${tournament.id}`);
    expect(detail.json()).toMatchObject({
      kind: 'TOURNAMENT',
      pointsRules: { '3-0': [3, 0], '3-1': [3, 0], '3-2': [2, 1] },
      groupsCount: 0,
    });

    const onlyTournaments = (await call(athlete, 'GET', '/competitions?kind=TOURNAMENT&limit=100')).json().data;
    expect(onlyTournaments.map((item: { id: string }) => item.id)).toContain(tournament.id);
    expect(onlyTournaments.every((item: { kind: string }) => item.kind === 'TOURNAMENT')).toBe(true);
    const onlyLeagues = (await call(athlete, 'GET', '/competitions?kind=LEAGUE&limit=100')).json().data;
    expect(onlyLeagues.map((item: { id: string }) => item.id)).not.toContain(tournament.id);
    expect((await call(athlete, 'GET', '/competitions?kind=CUP')).statusCode).toBe(422);
  });

  it('keeps a separate, derived standings table for each pool', async () => {
    const tournament = await createTournament('Torneo a gironi');
    const poolA = await createPool(tournament.id, 'Girone A', ['Aquile', 'Delfini', 'Falchi']);
    const poolB = await createPool(tournament.id, 'Girone B', ['Leoni', 'Tigri']);

    await poolA.play(1, 'Aquile', 'Delfini', 3, 1);
    await poolA.play(2, 'Falchi', 'Aquile', 3, 2);
    await poolB.play(1, 'Tigri', 'Leoni', 3, 0);

    const a = await poolA.standings();
    expect(a.rows.map((row) => [row.position, row.name, row.points])).toEqual([
      [1, 'Aquile', 4],
      [2, 'Falchi', 2],
      [3, 'Delfini', 0],
    ]);
    expect(a.rows[0]?.isOurTeam).toBe(true);
    const b = await poolB.standings();
    expect(b.rows.map((row) => [row.name, row.points])).toEqual([
      ['Tigri', 3],
      ['Leoni', 0],
    ]);
    expect(b.matchesPlayed).toBe(1);
  });

  it('applies the tournament own points rules and tiebreakers', async () => {
    const tournament = await createTournament('Torneo regole');
    const patched = await call(admin, 'PATCH', `/competitions/${tournament.id}`, {
      pointsRules: { '3-0': [3, 0], '3-1': [3, 0], '3-2': [3, 1] },
    });
    expect(patched.statusCode).toBe(200);
    const pool = await createPool(tournament.id, 'Girone unico', ['Aquile', 'Delfini']);
    await pool.play(1, 'Delfini', 'Aquile', 2, 3);
    expect((await pool.standings()).rows.map((row) => [row.name, row.points])).toEqual([
      ['Aquile', 3],
      ['Delfini', 1],
    ]);
  });

  it('lets athletes read but not manage tournaments, and hides them from other societies', async () => {
    const tournament = await createTournament('Torneo privato');
    expect((await call(athlete, 'GET', `/competitions/${tournament.id}`)).statusCode).toBe(200);
    expect((await call(athlete, 'POST', '/competitions', { seasonId, name: 'Hack', kind: 'TOURNAMENT' })).statusCode).toBe(403);
    expect((await call(athlete, 'DELETE', `/competitions/${tournament.id}`)).statusCode).toBe(403);
    expect((await call(outsider, 'GET', `/competitions/${tournament.id}`)).statusCode).toBe(404);
    const foreignList = (await call(outsider, 'GET', '/competitions?kind=TOURNAMENT&limit=100')).json().data;
    expect(foreignList.map((item: { id: string }) => item.id)).not.toContain(tournament.id);
  });

  it('refuses to delete a tournament that still has matches', async () => {
    const tournament = await createTournament('Torneo da chiudere');
    const pool = await createPool(tournament.id, 'Girone', ['Aquile', 'Delfini']);
    await pool.play(1, 'Aquile', 'Delfini', 3, 0);
    expect((await call(admin, 'DELETE', `/competitions/${tournament.id}`)).statusCode).toBe(409);
  });
});
