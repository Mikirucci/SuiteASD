import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseMatchRows } from '../src/modules/competitions/match-import.js';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety, createTeam, type Actor } from './helpers/factories.js';

const CALENDAR = [
  'Giornata;Data;Ora;Casa;Ospite;Risultato',
  '1;12/09/2026;20:30;Aquile Volley;Delfini Volley;3-1',
  '2;19/09/2026;18:00;Falchi Volley;Aquile Volley;',
  '3;26/09/2026;20.30;Aquile Volley;Leoni Volley;',
].join('\n');

describe('parseMatchRows (unit)', () => {
  it('reads Italian dates, times and results, in the time zone of the society', () => {
    const { rows, problems } = parseMatchRows(CALENDAR);
    expect(problems).toEqual([]);
    expect(rows.map((row) => [row.round, row.home, row.away, row.homeSets, row.awaySets])).toEqual([
      [1, 'Aquile Volley', 'Delfini Volley', 3, 1],
      [2, 'Falchi Volley', 'Aquile Volley', null, null],
      [3, 'Aquile Volley', 'Leoni Volley', null, null],
    ]);
    // September is summer time in Italy: 20:30 local is 18:30 UTC
    expect(rows[0]?.playedAt?.toISOString()).toBe('2026-09-12T18:30:00.000Z');
    expect(rows[2]?.playedAt?.toISOString()).toBe('2026-09-26T18:30:00.000Z');
  });

  it('accepts ISO dates, comma separated files, English headers and set columns', () => {
    const { rows, problems } = parseMatchRows('round,date,time,home,away,homeSets,awaySets\n4,2026-11-14,21:00,A,B,3,2');
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ round: 4, home: 'A', away: 'B', homeSets: 3, awaySets: 2 });
    expect(rows[0]?.playedAt?.toISOString()).toBe('2026-11-14T20:00:00.000Z');
  });

  it('allows a match with no round and no date', () => {
    const { rows } = parseMatchRows('casa;ospite\nA;B');
    expect(rows[0]).toMatchObject({ round: null, playedAt: null, homeSets: null });
  });

  it('reports every bad row with its number and the field', () => {
    const csv = [
      'giornata;data;ora;casa;ospite;risultato',
      'x;12/09/2026;20:30;A;B;',
      '1;31/02/2026;20:30;A;B;',
      '1;12/09/2026;25:00;A;B;',
      '1;;20:30;A;B;',
      '1;12/09/2026;20:30;A;A;',
      '1;12/09/2026;20:30;;B;',
      '1;12/09/2026;20:30;A;B;3-3',
      '1;12/09/2026;20:30;A;B;tre a uno',
      '1;12/09/2026;20:30;C;D;3-0',
    ].join('\n');
    const { rows, problems } = parseMatchRows(csv);
    expect(rows).toHaveLength(1);
    expect(problems.map((problem) => [problem.row, problem.field])).toEqual([
      [2, 'giornata'],
      [3, 'data'],
      [4, 'ora'],
      [5, 'data'],
      [6, 'ospite'],
      [7, 'casa'],
      [8, 'risultato'],
      [9, 'risultato'],
    ]);
  });

  it('refuses a file with no team columns, an empty file and too many rows', () => {
    expect(() => parseMatchRows('giornata;data\n1;12/09/2026')).toThrow(/home team/);
    expect(() => parseMatchRows('')).toThrow(/empty/);
    const many = ['casa;ospite', ...Array.from({ length: 501 }, (_, index) => `A${index};B${index}`)].join('\n');
    expect(() => parseMatchRows(many)).toThrow(/At most 500/);
  });

  it('lists the columns it does not use', () => {
    expect(parseMatchRows('casa;ospite;palestra;arbitro\nA;B;X;Y').ignoredColumns).toEqual(['palestra', 'arbitro']);
  });
});

describe('importing the calendar and the results of a group', () => {
  let ctx: TestContext;
  let societyId: string;
  let ourTeamId: string;
  const actors = {} as Record<Role, Actor>;
  let competitionId: string;
  let groupId: string;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Calendari ASD')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    ourTeamId = (await createTeam(ctx, societyId, 'Aquile Volley')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  // Each test gets its own group, so they do not depend on each other.
  async function freshGroup() {
    seq += 1;
    const season = await ctx.prisma.season.create({
      data: { societyId, name: `Stagione ${seq}`, startsOn: new Date('2026-09-01T00:00:00.000Z'), endsOn: new Date('2027-06-30T00:00:00.000Z') },
    });
    const competition = await ctx.prisma.competition.create({ data: { societyId, seasonId: season.id, name: `Serie D ${seq}` } });
    const group = await ctx.prisma.group.create({ data: { societyId, competitionId: competition.id, name: 'Girone B' } });
    competitionId = competition.id;
    groupId = group.id;
  }

  const send = (actor: Actor | null, csv: string, dryRun?: boolean, group = groupId, competition = competitionId) =>
    ctx.app.inject({
      method: 'POST',
      url: `${API}/competitions/${competition}/groups/${group}/matches/import`,
      headers: actor?.headers,
      payload: dryRun === undefined ? { csv } : { csv, dryRun },
    });
  const matches = () => ctx.prisma.match.findMany({ where: { groupId }, include: { homeTeam: true, awayTeam: true }, orderBy: { round: 'asc' } });

  it('checks without writing by default, and says what it would do', async () => {
    await freshGroup();
    const response = await send(actors.ADMIN, CALENDAR);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      dryRun: true,
      totalRows: 3,
      validRows: 3,
      invalidRows: 0,
      teamsCreated: 4,
      matchesCreated: 3,
      matchesUpdated: 0,
      resultsSet: 1,
      eventsCreated: 2,
      ignoredColumns: [],
      errors: [],
    });
    expect(await matches()).toEqual([]);
    expect(await ctx.prisma.groupTeam.count({ where: { groupId } })).toBe(0);
  });

  it('creates the teams, the matches, the result and the events of our matches', async () => {
    await freshGroup();
    const response = await send(actors.ADMIN, CALENDAR, false);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ dryRun: false, matchesCreated: 3, teamsCreated: 4, resultsSet: 1, eventsCreated: 2 });

    const created = await matches();
    expect(created.map((match) => [match.round, match.homeTeam.name, match.awayTeam.name, match.status, match.homeSets, match.awaySets])).toEqual([
      [1, 'Aquile Volley', 'Delfini Volley', 'PLAYED', 3, 1],
      [2, 'Falchi Volley', 'Aquile Volley', 'SCHEDULED', null, null],
      [3, 'Aquile Volley', 'Leoni Volley', 'SCHEDULED', null, null],
    ]);
    expect(created[0]?.playedAt?.toISOString()).toBe('2026-09-12T18:30:00.000Z');

    // A name equal to one of our teams becomes our team
    const ours = await ctx.prisma.groupTeam.findFirstOrThrow({ where: { groupId, name: 'Aquile Volley' } });
    expect(ours.teamId).toBe(ourTeamId);
    expect((await ctx.prisma.groupTeam.findFirstOrThrow({ where: { groupId, name: 'Falchi Volley' } })).teamId).toBeNull();

    // Only the matches still to play get an event, for our team, linked to the match
    expect(created[0]?.eventId).toBeNull();
    for (const match of created.slice(1)) {
      const event = await ctx.prisma.event.findUniqueOrThrow({ where: { id: match.eventId ?? '' } });
      expect(event).toMatchObject({ type: 'MATCH', teamId: ourTeamId, status: 'SCHEDULED' });
      expect(event.title).toBe(`${match.homeTeam.name} vs ${match.awayTeam.name}`);
      expect(event.startsAt.toISOString()).toBe(match.playedAt?.toISOString());
    }
  });

  it('feeds the standings: the result of the file is counted', async () => {
    await freshGroup();
    await send(actors.ADMIN, CALENDAR, false);
    const standings = (await ctx.app.inject({ method: 'GET', url: `${API}/competitions/${competitionId}/groups/${groupId}/standings`, headers: actors.ADMIN.headers })).json();
    const aquile = standings.rows.find((row: { name: string }) => row.name === 'Aquile Volley');
    expect(aquile).toMatchObject({ position: 1, points: 3, played: 1, won: 1 });
  });

  it('updates a match found again instead of duplicating it, and fills in the result later', async () => {
    await freshGroup();
    await send(actors.ADMIN, CALENDAR, false);
    const updated = [
      'Giornata;Data;Ora;Casa;Ospite;Risultato',
      '2;20/09/2026;18:00;Falchi Volley;Aquile Volley;1-3',
      '4;03/10/2026;20:30;Delfini Volley;Aquile Volley;',
    ].join('\n');
    const dry = (await send(actors.ADMIN, updated)).json();
    expect(dry).toMatchObject({ matchesCreated: 1, matchesUpdated: 1, teamsCreated: 0, resultsSet: 1, eventsCreated: 1 });

    expect((await send(actors.ADMIN, updated, false)).statusCode).toBe(200);
    const all = await matches();
    expect(all).toHaveLength(4);
    const second = all.find((match) => match.round === 2);
    expect(second).toMatchObject({ status: 'PLAYED', homeSets: 1, awaySets: 3 });
    expect(second?.playedAt?.toISOString()).toBe('2026-09-20T16:00:00.000Z');
    // Importing the same file again changes nothing
    const again = (await send(actors.ADMIN, updated, false)).json();
    expect(again).toMatchObject({ matchesCreated: 0, matchesUpdated: 2 });
    expect(await matches()).toHaveLength(4);
  });

  it('reports the invalid rows and still imports the valid ones', async () => {
    await freshGroup();
    const csv = ['giornata;data;ora;casa;ospite;risultato', '1;12/09/2026;20:30;A;B;3-0', '2;pippo;20:30;A;C;', '3;19/09/2026;20:30;A;A;'].join('\n');
    const result = (await send(actors.ADMIN, csv, false)).json();
    expect(result).toMatchObject({ totalRows: 3, validRows: 1, invalidRows: 2, matchesCreated: 1 });
    expect(result.errors.map((error: { row: number }) => error.row)).toEqual([3, 4]);
    expect(await matches()).toHaveLength(1);
  });

  it('flags the same match twice in the file', async () => {
    await freshGroup();
    const csv = ['giornata;casa;ospite', '1;A;B', '1;a;b'].join('\n');
    const result = (await send(actors.ADMIN, csv, false)).json();
    expect(result).toMatchObject({ validRows: 1, invalidRows: 1, matchesCreated: 1 });
    expect(result.errors[0].message).toMatch(/twice/);
  });

  it('rejects a bad file with 422 and an unknown group with 422/404', async () => {
    await freshGroup();
    expect((await send(actors.ADMIN, 'giornata;data\n1;12/09/2026')).statusCode).toBe(422);
    expect((await send(actors.ADMIN, '')).statusCode).toBe(422);
    expect((await send(actors.ADMIN, CALENDAR, true, 'missing')).statusCode).toBe(422);
  });

  it('is for those who manage competitions', async () => {
    await freshGroup();
    for (const role of ROLES) {
      const allowed = ['ADMIN', 'SEGRETERIA', 'ALLENATORE'].includes(role);
      expect((await send(actors[role], CALENDAR)).statusCode, role).toBe(allowed ? 200 : 403);
    }
    expect((await send(null, CALENDAR)).statusCode).toBe(401);
  });

  it('never touches the group of another society', async () => {
    await freshGroup();
    const other = await createSociety(ctx, 'Altra ASD');
    const outsider = await createActor(ctx, other.id, 'ADMIN');
    const response = await send(outsider, CALENDAR, false);
    expect(response.statusCode).toBe(422);
    expect(await matches()).toEqual([]);
  });
});
