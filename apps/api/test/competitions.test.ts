import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StandingsDto } from '../src/modules/competitions/schema.js';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety, createTeam, type Actor } from './helpers/factories.js';

describe('competitions module (SPEC 05)', () => {
  let ctx: TestContext;
  let societyId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;
  let seasonId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Test')).id;
    const otherSocietyId = (await createSociety(ctx, 'Altra Societa')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
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

  async function createCompetition(overrides: object = {}) {
    const response = await call(actors.ADMIN, 'POST', '/competitions', { seasonId, name: `Serie D ${Math.random()}`, ...overrides });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }

  async function createGroup(competitionId: string, name = 'Girone B') {
    const response = await call(actors.ADMIN, 'POST', `/competitions/${competitionId}/groups`, { name });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }

  async function addTeam(competitionId: string, groupId: string, payload: object) {
    const response = await call(actors.ADMIN, 'POST', `/competitions/${competitionId}/groups/${groupId}/teams`, payload);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<{ id: string; name: string; isOurTeam: boolean }>();
  }

  // A fresh competition with one group and the given participants (the first one is ours).
  async function league(names: string[]) {
    const competition = await createCompetition();
    const group = await createGroup(competition.id);
    const ourTeam = await createTeam(ctx, societyId, `Team ${Math.random()}`);
    const teams: Record<string, string> = {};
    for (const [index, name] of names.entries()) {
      teams[name] = (await addTeam(competition.id, group.id, index === 0 ? { name, teamId: ourTeam.id } : { name })).id;
    }
    const base = `/competitions/${competition.id}/groups/${group.id}`;
    const play = async (round: number, home: string, away: string, homeSets: number, awaySets: number, setScores?: number[][]) => {
      const match = await call(actors.ADMIN, 'POST', `${base}/matches`, { round, homeTeamId: teams[home], awayTeamId: teams[away] });
      expect(match.statusCode, match.body).toBe(201);
      const result = await call(actors.ADMIN, 'PUT', `/matches/${match.json().id}/result`, { homeSets, awaySets, setScores });
      expect(result.statusCode, result.body).toBe(200);
      return match.json().id as string;
    };
    const standings = async () => (await call(actors.ADMIN, 'GET', `${base}/standings`)).json<StandingsDto>();
    return { competition, group, teams, base, play, standings };
  }

  describe('authentication and role matrix', () => {
    it('answers 401 without a token', async () => {
      const response = await call(null, 'GET', '/competitions');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'unauthorized' });
    });

    it.each(ROLES)('%s can read competitions', async (role) => {
      expect((await call(actors[role], 'GET', '/competitions')).statusCode).toBe(200);
      expect((await call(actors[role], 'GET', '/seasons')).statusCode).toBe(200);
    });

    it.each([
      ['ADMIN', 201],
      ['SEGRETERIA', 201],
      ['ALLENATORE', 201],
      ['STAFF', 403],
      ['ATLETA', 403],
      ['GENITORE', 403],
    ] as const)('%s creating a competition gets %i', async (role, expected) => {
      const response = await call(actors[role], 'POST', '/competitions', { seasonId, name: `Matrix ${role}` });
      expect(response.statusCode).toBe(expected);
    });

    it('forbids athletes and guardians to enter results', async () => {
      const { teams, base } = await league(['Aquile', 'Delfini']);
      const match = await call(actors.ALLENATORE, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: teams.Delfini });
      const id = match.json().id as string;
      for (const role of ['ATLETA', 'GENITORE', 'STAFF'] as const) {
        const response = await call(actors[role], 'PUT', `/matches/${id}/result`, { homeSets: 3, awaySets: 0 });
        expect(response.statusCode, role).toBe(403);
      }
      expect((await call(actors.ALLENATORE, 'PUT', `/matches/${id}/result`, { homeSets: 3, awaySets: 0 })).statusCode).toBe(200);
    });
  });

  describe('seasons', () => {
    it('creates, lists, updates and deletes a season, keeping a single current one', async () => {
      const first = await call(actors.ADMIN, 'POST', '/seasons', {
        name: '2030/31',
        startsOn: '2030-09-01T00:00:00.000Z',
        endsOn: '2031-06-30T00:00:00.000Z',
        isCurrent: true,
      });
      expect(first.statusCode).toBe(201);
      const second = await call(actors.ADMIN, 'POST', '/seasons', {
        name: '2031/32',
        startsOn: '2031-09-01T00:00:00.000Z',
        endsOn: '2032-06-30T00:00:00.000Z',
        isCurrent: true,
      });
      const list = (await call(actors.ADMIN, 'GET', '/seasons?limit=100')).json();
      const current = list.data.filter((season: { isCurrent: boolean }) => season.isCurrent);
      expect(current.map((season: { id: string }) => season.id)).toEqual([second.json().id]);

      const patched = await call(actors.ADMIN, 'PATCH', `/seasons/${first.json().id}`, { name: '2030/31 bis' });
      expect(patched.json()).toMatchObject({ name: '2030/31 bis', isCurrent: false });
      expect((await call(actors.ADMIN, 'DELETE', `/seasons/${first.json().id}`)).statusCode).toBe(204);
      expect((await call(actors.ADMIN, 'GET', `/seasons/${first.json().id}`)).statusCode).toBe(404);
    });

    it('rejects an inverted period (422) and a duplicate name (409)', async () => {
      const inverted = await call(actors.ADMIN, 'POST', '/seasons', {
        name: 'Inverted',
        startsOn: '2030-09-01T00:00:00.000Z',
        endsOn: '2030-08-01T00:00:00.000Z',
      });
      expect(inverted.statusCode).toBe(422);
      const duplicate = await call(actors.ADMIN, 'POST', '/seasons', {
        name: '2026/27',
        startsOn: '2026-09-01T00:00:00.000Z',
        endsOn: '2027-06-30T00:00:00.000Z',
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ code: 'season_name_taken' });
    });

    it('refuses to delete a season that has competitions', async () => {
      await createCompetition();
      const response = await call(actors.ADMIN, 'DELETE', `/seasons/${seasonId}`);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'season_in_use' });
    });
  });

  describe('competitions, groups and participants', () => {
    it('applies the default volleyball rules and lets a competition override them', async () => {
      const defaults = await call(actors.ADMIN, 'POST', '/competitions', { seasonId, name: 'Defaults' });
      expect(defaults.json()).toMatchObject({
        kind: 'LEAGUE',
        sport: 'VOLLEY',
        pointsRules: { '3-0': [3, 0], '3-1': [3, 0], '3-2': [2, 1] },
        tiebreakers: ['WINS', 'SET_RATIO', 'POINT_RATIO'],
        groupsCount: 0,
      });
      const custom = await call(actors.ADMIN, 'PATCH', `/competitions/${defaults.json().id}`, {
        pointsRules: { '3-0': [3, 0], '3-1': [3, 0], '3-2': [3, 1] },
        tiebreakers: ['SET_RATIO'],
      });
      expect(custom.json()).toMatchObject({ pointsRules: { '3-2': [3, 1] }, tiebreakers: ['SET_RATIO'] });
      const restored = await call(actors.ADMIN, 'PATCH', `/competitions/${defaults.json().id}`, { pointsRules: null });
      expect(restored.json().pointsRules['3-2']).toEqual([2, 1]);
    });

    it('validates rules (all scores required) and tiebreakers (no repeats)', async () => {
      const missing = await call(actors.ADMIN, 'POST', '/competitions', { seasonId, name: 'Bad rules', pointsRules: { '3-0': [3, 0] } });
      expect(missing.statusCode).toBe(422);
      const repeated = await call(actors.ADMIN, 'POST', '/competitions', { seasonId, name: 'Bad ties', tiebreakers: ['WINS', 'WINS'] });
      expect(repeated.statusCode).toBe(422);
    });

    it('filters the competition list and paginates it', async () => {
      const society = await createSociety(ctx, 'Filter ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const season = await ctx.prisma.season.create({
        data: { societyId: society.id, name: 'S', startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
      });
      for (const name of ['C', 'A', 'E', 'B', 'D']) {
        await ctx.app.inject({ method: 'POST', url: `${API}/competitions`, headers: admin.headers, payload: { seasonId: season.id, name } });
      }
      const names: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `limit=2&cursor=${cursor}` : 'limit=2';
        const page: { data: { name: string }[]; page: { nextCursor: string | null } } = (
          await ctx.app.inject({ method: 'GET', url: `${API}/competitions?${query}`, headers: admin.headers })
        ).json();
        names.push(...page.data.map((competition) => competition.name));
        cursor = page.page.nextCursor;
      } while (cursor);
      expect(names).toEqual(['A', 'B', 'C', 'D', 'E']);
      const filtered = await ctx.app.inject({ method: 'GET', url: `${API}/competitions?q=C`, headers: admin.headers });
      expect(filtered.json().data).toHaveLength(1);
    });

    it('creates groups with participants: our teams are flagged, opponents are plain names', async () => {
      const { competition, group, base } = await league(['Aquile Volley', 'Delfini Volley']);
      const teams = (await call(actors.ALLENATORE, 'GET', `${base}/teams`)).json();
      expect(teams.data.map((team: { name: string; isOurTeam: boolean }) => [team.name, team.isOurTeam])).toEqual([
        ['Aquile Volley', true],
        ['Delfini Volley', false],
      ]);
      const groups = (await call(actors.ATLETA, 'GET', `/competitions/${competition.id}/groups`)).json();
      expect(groups.data).toMatchObject([{ id: group.id, name: 'Girone B', teamsCount: 2, matchesCount: 0 }]);
    });

    it('defaults the participant name to our team name and rejects a team added twice', async () => {
      const competition = await createCompetition();
      const group = await createGroup(competition.id);
      const ours = await createTeam(ctx, societyId, 'Serie D rosa');
      const added = await addTeam(competition.id, group.id, { teamId: ours.id });
      expect(added).toMatchObject({ name: 'Serie D rosa', isOurTeam: true });
      const again = await call(actors.ADMIN, 'POST', `/competitions/${competition.id}/groups/${group.id}/teams`, { teamId: ours.id });
      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'team_already_in_group' });
      const empty = await call(actors.ADMIN, 'POST', `/competitions/${competition.id}/groups/${group.id}/teams`, {});
      expect(empty.statusCode).toBe(422);
    });

    it('rejects duplicate names for groups and participants', async () => {
      const competition = await createCompetition();
      const group = await createGroup(competition.id, 'Girone A');
      expect((await call(actors.ADMIN, 'POST', `/competitions/${competition.id}/groups`, { name: 'Girone A' })).json()).toMatchObject({
        code: 'group_name_taken',
      });
      await addTeam(competition.id, group.id, { name: 'Falchi' });
      const duplicate = await call(actors.ADMIN, 'POST', `/competitions/${competition.id}/groups/${group.id}/teams`, { name: 'Falchi' });
      expect(duplicate.json()).toMatchObject({ code: 'group_team_name_taken' });
    });

    it('protects groups, participants and competitions that still have matches', async () => {
      const { competition, group, teams, base, play } = await league(['Aquile', 'Delfini']);
      await play(1, 'Aquile', 'Delfini', 3, 0);
      const removeTeam = await call(actors.ADMIN, 'DELETE', `${base}/teams/${teams.Aquile}`);
      const removeGroup = await call(actors.ADMIN, 'DELETE', `/competitions/${competition.id}/groups/${group.id}`);
      const removeCompetition = await call(actors.ADMIN, 'DELETE', `/competitions/${competition.id}`);
      expect([removeTeam.statusCode, removeGroup.statusCode, removeCompetition.statusCode]).toEqual([409, 409, 409]);
      expect(removeTeam.json()).toMatchObject({ code: 'group_team_has_matches' });
    });

    it('deletes an empty competition tree', async () => {
      const competition = await createCompetition();
      const group = await createGroup(competition.id);
      const team = await addTeam(competition.id, group.id, { name: 'Solo' });
      expect((await call(actors.ADMIN, 'DELETE', `/competitions/${competition.id}/groups/${group.id}/teams/${team.id}`)).statusCode).toBe(204);
      expect((await call(actors.ADMIN, 'PATCH', `/competitions/${competition.id}/groups/${group.id}`, { name: 'Renamed' })).json()).toMatchObject({
        name: 'Renamed',
      });
      expect((await call(actors.ADMIN, 'DELETE', `/competitions/${competition.id}/groups/${group.id}`)).statusCode).toBe(204);
      expect((await call(actors.ADMIN, 'DELETE', `/competitions/${competition.id}`)).statusCode).toBe(204);
    });
  });

  describe('matches and results', () => {
    it('schedules a match, enters the result and removes it again', async () => {
      const { teams, base } = await league(['Aquile', 'Delfini']);
      const created = await call(actors.ALLENATORE, 'POST', `${base}/matches`, {
        round: 6,
        homeTeamId: teams.Aquile,
        awayTeamId: teams.Delfini,
        playedAt: '2026-11-14T19:30:00.000Z',
      });
      expect(created.json()).toMatchObject({
        round: 6,
        status: 'SCHEDULED',
        homeSets: null,
        homeTeam: { name: 'Aquile', isOurTeam: true },
        awayTeam: { name: 'Delfini', isOurTeam: false },
      });
      const id = created.json().id as string;

      const result = await call(actors.ALLENATORE, 'PUT', `/matches/${id}/result`, {
        homeSets: 3,
        awaySets: 1,
        setScores: [[25, 20], [22, 25], [25, 18], [25, 23]],
      });
      expect(result.json()).toMatchObject({ status: 'PLAYED', homeSets: 3, awaySets: 1, playedAt: '2026-11-14T19:30:00.000Z' });
      expect(result.json().setScores).toEqual([[25, 20], [22, 25], [25, 18], [25, 23]]);

      const cleared = await call(actors.ALLENATORE, 'DELETE', `/matches/${id}/result`);
      expect(cleared.json()).toMatchObject({ status: 'SCHEDULED', homeSets: null, awaySets: null, setScores: null });
      expect((await call(actors.ALLENATORE, 'DELETE', `/matches/${id}/result`)).json()).toMatchObject({ code: 'match_not_played' });
    });

    it('rejects results that break the volleyball rules with field errors', async () => {
      const { teams, base } = await league(['Aquile', 'Delfini']);
      const id = (await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: teams.Delfini })).json().id;
      const draw = await call(actors.ADMIN, 'PUT', `/matches/${id}/result`, { homeSets: 2, awaySets: 2 });
      expect(draw.statusCode).toBe(422);
      expect(draw.json()).toMatchObject({ code: 'invalid_result' });
      expect(draw.json().errors[0].path).toBe('homeSets');
      const badSet = await call(actors.ADMIN, 'PUT', `/matches/${id}/result`, {
        homeSets: 3,
        awaySets: 0,
        setScores: [[25, 24], [25, 20], [25, 20]],
      });
      expect(badSet.json().errors).toEqual([expect.objectContaining({ path: 'setScores.0' })]);
      const tooMany = await call(actors.ADMIN, 'PUT', `/matches/${id}/result`, { homeSets: 5, awaySets: 0 });
      expect(tooMany.statusCode).toBe(422);
      expect((await call(actors.ADMIN, 'GET', `/matches/${id}`)).json()).toMatchObject({ status: 'SCHEDULED' });
    });

    it('rejects a match against itself and participants from another group', async () => {
      const { teams, base } = await league(['Aquile', 'Delfini']);
      const self = await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: teams.Aquile });
      expect(self.statusCode).toBe(422);
      const other = await league(['Falchi', 'Leoni']);
      const foreign = await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: other.teams.Falchi });
      expect(foreign.statusCode).toBe(404);
    });

    it('postpones and cancels, but a played match must lose its result first', async () => {
      const { teams, base, play } = await league(['Aquile', 'Delfini']);
      const open = (await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: teams.Delfini })).json().id;
      expect((await call(actors.ADMIN, 'PATCH', `/matches/${open}`, { status: 'POSTPONED', playedAt: '2026-12-01T19:30:00.000Z' })).json()).toMatchObject({
        status: 'POSTPONED',
        playedAt: '2026-12-01T19:30:00.000Z',
      });
      expect((await call(actors.ADMIN, 'PATCH', `/matches/${open}`, { status: 'CANCELLED' })).statusCode).toBe(200);
      const cancelledResult = await call(actors.ADMIN, 'PUT', `/matches/${open}/result`, { homeSets: 3, awaySets: 0 });
      expect(cancelledResult.json()).toMatchObject({ code: 'match_cancelled' });

      const playedId = await play(2, 'Aquile', 'Delfini', 3, 1);
      const change = await call(actors.ADMIN, 'PATCH', `/matches/${playedId}`, { status: 'SCHEDULED' });
      expect(change.json()).toMatchObject({ code: 'match_already_played' });
      expect((await call(actors.ADMIN, 'PATCH', `/matches/${playedId}`, { round: 3 })).json()).toMatchObject({ round: 3, status: 'PLAYED' });
    });

    it('lists the matches of a group by round with filters and exposes the rounds', async () => {
      const { teams, base, play } = await league(['Aquile', 'Delfini', 'Falchi']);
      await play(1, 'Aquile', 'Delfini', 3, 0);
      await play(2, 'Falchi', 'Aquile', 1, 3);
      await call(actors.ADMIN, 'POST', `${base}/matches`, { round: 2, homeTeamId: teams.Delfini, awayTeamId: teams.Falchi });

      const all = (await call(actors.ADMIN, 'GET', `${base}/matches`)).json();
      expect(all.data.map((match: { round: number }) => match.round)).toEqual([1, 2, 2]);
      const byRound = (await call(actors.ADMIN, 'GET', `${base}/matches?round=2&status=PLAYED`)).json();
      expect(byRound.data).toHaveLength(1);
      const byTeam = (await call(actors.ADMIN, 'GET', `${base}/matches?groupTeamId=${teams.Aquile}`)).json();
      expect(byTeam.data).toHaveLength(2);

      const paged = (await call(actors.ADMIN, 'GET', `${base}/matches?limit=2`)).json();
      expect(paged.page.hasMore).toBe(true);
      const rest = (await call(actors.ADMIN, 'GET', `${base}/matches?limit=2&cursor=${paged.page.nextCursor}`)).json();
      expect(rest.data).toHaveLength(1);

      const rounds = (await call(actors.ADMIN, 'GET', `${base}/rounds`)).json();
      expect(rounds.data).toEqual([
        { round: 1, matchesCount: 1, playedCount: 1 },
        { round: 2, matchesCount: 2, playedCount: 1 },
      ]);
    });

    it('links a match to a calendar event only once', async () => {
      const { teams, base } = await league(['Aquile', 'Delfini']);
      const event = await ctx.prisma.event.create({
        data: { societyId, type: 'MATCH', title: 'Aquile - Delfini', startsAt: new Date('2026-11-14T19:30:00Z') },
      });
      const first = await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: teams.Delfini, eventId: event.id });
      expect(first.statusCode).toBe(201);
      const second = await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Delfini, awayTeamId: teams.Aquile, eventId: event.id });
      expect(second.json()).toMatchObject({ code: 'event_already_linked' });
      const ghost = await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Delfini, awayTeamId: teams.Aquile, eventId: 'missing' });
      expect(ghost.statusCode).toBe(404);
    });

    it('does not delete a match that has report cards', async () => {
      const { teams, base } = await league(['Aquile', 'Delfini']);
      const id = (await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: teams.Delfini })).json().id;
      const member = await ctx.prisma.member.create({ data: { societyId, firstName: 'Giulia', lastName: 'Rossi' } });
      await ctx.prisma.playerEvaluation.create({
        data: { societyId, matchId: id, memberId: member.id, authorId: actors.ALLENATORE.user.id, rating: 8.5 },
      });
      const response = await call(actors.ADMIN, 'DELETE', `/matches/${id}`);
      expect(response.json()).toMatchObject({ code: 'match_has_evaluations' });
    });
  });

  describe('standings (derived)', () => {
    it('is empty-but-complete before any result, with our team flagged', async () => {
      const { standings } = await league(['Aquile', 'Delfini', 'Falchi']);
      const body = await standings();
      expect(body.rows.map((row) => row.name)).toEqual(['Aquile', 'Delfini', 'Falchi']);
      expect(body.rows.map((row) => row.position)).toEqual([1, 2, 3]);
      expect(body.rows[0]).toMatchObject({ isOurTeam: true, points: 0, played: 0 });
      expect(body).toMatchObject({ matchesPlayed: 0, matchesTotal: 0, groupName: 'Girone B' });
    });

    it('recomputes by itself: a 3-1 over the runner-up lifts our team above the leader', async () => {
      const { teams, play, standings, base } = await league(['Aquile', 'Delfini', 'Falchi']);
      await play(1, 'Falchi', 'Delfini', 3, 0); // Falchi 3
      await play(2, 'Aquile', 'Falchi', 2, 3); // Falchi 5, Aquile 1
      await play(3, 'Delfini', 'Aquile', 0, 3); // Aquile 4
      const before = await standings();
      expect(before.rows.map((row) => [row.name, row.points])).toEqual([
        ['Falchi', 5],
        ['Aquile', 4],
        ['Delfini', 0],
      ]);

      const match = await call(actors.ALLENATORE, 'POST', `${base}/matches`, { round: 4, homeTeamId: teams.Aquile, awayTeamId: teams.Delfini });
      await call(actors.ALLENATORE, 'PUT', `/matches/${match.json().id}/result`, { homeSets: 3, awaySets: 1 });
      const after = await standings();
      expect(after.rows.map((row: { name: string; points: number; position: number }) => [row.position, row.name, row.points])).toEqual([
        [1, 'Aquile', 7],
        [2, 'Falchi', 5],
        [3, 'Delfini', 0],
      ]);
      expect(after.rows[0]).toMatchObject({ isOurTeam: true, played: 3, won: 2, lost: 1, setsFor: 8, setsAgainst: 4 });
      expect(after).toMatchObject({ matchesPlayed: 4, matchesTotal: 4 });
    });

    it('follows corrections and removals of a result, and ignores cancelled matches', async () => {
      const { teams, play, standings, base } = await league(['Aquile', 'Delfini']);
      const id = await play(1, 'Aquile', 'Delfini', 3, 0);
      expect((await standings()).rows[0]).toMatchObject({ name: 'Aquile', points: 3 });
      await call(actors.ADMIN, 'PUT', `/matches/${id}/result`, { homeSets: 2, awaySets: 3 });
      // 2-3 under the default rules: winner 2 points, loser 1
      expect((await standings()).rows.map((row: { name: string; points: number }) => [row.name, row.points])).toEqual([
        ['Delfini', 2],
        ['Aquile', 1],
      ]);

      await call(actors.ADMIN, 'DELETE', `/matches/${id}/result`);
      expect((await standings()).rows.map((row) => row.played)).toEqual([0, 0]);

      const cancelled = await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: teams.Delfini });
      await call(actors.ADMIN, 'PATCH', `/matches/${cancelled.json().id}`, { status: 'CANCELLED' });
      // The cancelled match is excluded; the first one is scheduled again after its result was deleted.
      expect(await standings()).toMatchObject({ matchesPlayed: 0, matchesTotal: 1 });
    });

    it('uses the competition rules and tiebreakers, including set points', async () => {
      const competition = await createCompetition({
        pointsRules: { '3-0': [3, 0], '3-1': [3, 0], '3-2': [3, 1] },
        tiebreakers: ['POINT_RATIO'],
      });
      const group = await createGroup(competition.id);
      const base = `/competitions/${competition.id}/groups/${group.id}`;
      const ids: Record<string, string> = {};
      for (const name of ['A', 'B', 'X', 'Y']) ids[name] = (await addTeam(competition.id, group.id, { name })).id;
      const enter = async (home: string, away: string, setScores: number[][]) => {
        const match = await call(actors.ADMIN, 'POST', `${base}/matches`, { homeTeamId: ids[home], awayTeamId: ids[away] });
        const result = await call(actors.ADMIN, 'PUT', `/matches/${match.json().id}/result`, { homeSets: 3, awaySets: 0, setScores });
        expect(result.statusCode, result.body).toBe(200);
      };
      await enter('A', 'X', [[25, 23], [25, 23], [25, 23]]);
      await enter('B', 'Y', [[25, 10], [25, 10], [25, 10]]);
      const body = (await call(actors.ADMIN, 'GET', `${base}/standings`)).json();
      expect(body.rows.slice(0, 2).map((row: { name: string }) => row.name)).toEqual(['B', 'A']);
      expect(body.rows[0]).toMatchObject({ pointsFor: 75, pointsAgainst: 30, pointRatio: 2.5, setRatio: null });
      expect(body.pointsRules['3-2']).toEqual([3, 1]);
    });

    it('is readable by athletes and guardians', async () => {
      const { competition, group } = await league(['Aquile', 'Delfini']);
      for (const role of ['ATLETA', 'GENITORE'] as const) {
        const response = await call(actors[role], 'GET', `/competitions/${competition.id}/groups/${group.id}/standings`);
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('tenant isolation', () => {
    it('never exposes competitions, groups, matches or standings of another society', async () => {
      const { competition, teams, base, play } = await league(['Aquile', 'Delfini']);
      const matchId = await play(1, 'Aquile', 'Delfini', 3, 0);

      const list = await call(outsider, 'GET', '/competitions?limit=100');
      expect(list.json().data.map((item: { id: string }) => item.id)).not.toContain(competition.id);
      const seasons = await call(outsider, 'GET', '/seasons?limit=100');
      expect(seasons.json().data.map((item: { id: string }) => item.id)).not.toContain(seasonId);

      const attempts = await Promise.all([
        call(outsider, 'GET', `/competitions/${competition.id}`),
        call(outsider, 'GET', `/competitions/${competition.id}/groups`),
        call(outsider, 'GET', `${base}/standings`),
        call(outsider, 'GET', `${base}/matches`),
        call(outsider, 'GET', `${base}/rounds`),
        call(outsider, 'GET', `/matches/${matchId}`),
        call(outsider, 'PUT', `/matches/${matchId}/result`, { homeSets: 0, awaySets: 3 }),
        call(outsider, 'DELETE', `/matches/${matchId}/result`),
        call(outsider, 'DELETE', `/matches/${matchId}`),
        call(outsider, 'POST', `${base}/matches`, { homeTeamId: teams.Aquile, awayTeamId: teams.Delfini }),
        call(outsider, 'PATCH', `/competitions/${competition.id}`, { name: 'Stolen' }),
      ]);
      expect(attempts.map((response) => response.statusCode)).toEqual(Array.from({ length: attempts.length }, () => 404));
      expect(await ctx.prisma.match.findUniqueOrThrow({ where: { id: matchId } })).toMatchObject({ homeSets: 3, status: 'PLAYED' });
    });

    it('refuses a season or one of our teams that belongs to another society', async () => {
      const foreignSeason = await call(outsider, 'POST', '/competitions', { seasonId, name: 'Cross tenant' });
      expect(foreignSeason.statusCode).toBe(404);

      const competition = await createCompetition();
      const group = await createGroup(competition.id);
      const foreignTeam = await createTeam(ctx, outsider.societyId, 'Foreign team');
      const response = await call(actors.ADMIN, 'POST', `/competitions/${competition.id}/groups/${group.id}/teams`, { teamId: foreignTeam.id });
      expect(response.statusCode).toBe(404);
    });
  });
});
