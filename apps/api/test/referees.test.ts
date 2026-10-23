import { describe, expect, it } from 'vitest';
import { API } from './helpers/app.js';
import { describeCrudModule, type CrudSuiteHandles } from './helpers/crud-suite.js';
import { createSociety, type Actor } from './helpers/factories.js';
import { createMatch } from './helpers/matches.js';

describeCrudModule(
  {
    title: 'referees',
    path: '/referees',
    readRoles: ['ADMIN', 'SEGRETERIA', 'STAFF'],
    writeRoles: ['ADMIN', 'STAFF'],
    createPayload: ({ n }) => ({
      firstName: 'Luca',
      lastName: `Arbitro${n}`,
      email: `arbitro${n}@example.test`,
      qualification: 'Arbitro regionale',
    }),
    invalidPayload: { firstName: '', lastName: ' ', email: 'non-una-email' },
    invalidFields: ['firstName', 'lastName', 'email'],
    patch: { payload: { qualification: null, phone: '3331234567' }, expected: { qualification: null, phone: '3331234567', firstName: 'Luca' } },
  },
  (get) => {
    describe('referee filters', () => {
      it('filters by a substring of the name and exposes the designations count', async () => {
        const { ctx, actors, societyId } = get();
        await ctx.prisma.referee.createMany({
          data: [
            { societyId, firstName: 'Giorgio', lastName: 'Verdi' },
            { societyId, firstName: 'Anna', lastName: 'Gialli' },
          ],
        });
        const response = await ctx.app.inject({ method: 'GET', url: `${API}/referees?q=Verd`, headers: actors.STAFF.headers });
        expect(response.json().data.map((item: { lastName: string }) => item.lastName)).toEqual(['Verdi']);
        expect(response.json().data[0].assignmentsCount).toBe(0);
      });
    });
  },
);

describeCrudModule(
  {
    title: 'referee designations',
    path: '/referee-assignments',
    readRoles: ['ADMIN', 'SEGRETERIA', 'STAFF'],
    writeRoles: ['ADMIN', 'STAFF'],
    createPayload: async ({ ctx, societyId, n }) => {
      const referee = await ctx.prisma.referee.create({ data: { societyId, firstName: 'Paola', lastName: `Fischio${n}` } });
      const match = await createMatch(ctx, societyId);
      return { refereeId: referee.id, matchId: match.id, feeCents: 4000 };
    },
    expectedFromPayload: (payload) => ({ ...payload, reimbursedAt: null }),
    invalidPayload: { refereeId: '', matchId: '', feeCents: -5 },
    invalidFields: ['refereeId', 'matchId', 'feeCents'],
    patch: {
      payload: { feeCents: 5500, reimbursedAt: '2026-11-20T10:00:00.000Z' },
      expected: { feeCents: 5500, reimbursedAt: '2026-11-20T10:00:00.000Z' },
    },
  },
  (get) => {
    const call = (handles: CrudSuiteHandles, actor: Actor, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object) =>
      handles.ctx.app.inject({ method, url: `${API}${path}`, headers: actor.headers, payload });

    describe('designation rules', () => {
      it('describes the match, takes the date from the calendar event and filters by referee, match and refund state', async () => {
        const handles = get();
        const { ctx, actors, societyId } = handles;
        const referee = await ctx.prisma.referee.create({ data: { societyId, firstName: 'Piero', lastName: 'Rossi' } });
        const match = await createMatch(ctx, societyId, new Date('2026-11-14T19:30:00.000Z'));
        const other = await createMatch(ctx, societyId);

        const created = await call(handles, actors.STAFF, 'POST', '/referee-assignments', { refereeId: referee.id, matchId: match.id, feeCents: 3500 });
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({
          refereeName: 'Piero Rossi',
          match: { homeTeam: 'Aquile', awayTeam: 'Delfini', round: 6, groupName: 'Girone B', competitionName: 'Serie D', date: '2026-11-14T19:30:00.000Z' },
        });
        const second = await call(handles, actors.STAFF, 'POST', '/referee-assignments', { refereeId: referee.id, matchId: other.id });
        expect(second.json()).toMatchObject({ feeCents: null });
        await call(handles, actors.STAFF, 'PATCH', `/referee-assignments/${created.json().id}`, { reimbursedAt: '2026-11-16T09:00:00.000Z' });

        const ids = async (query: string) => {
          const response = await call(handles, actors.ADMIN, 'GET', `/referee-assignments?${query}&limit=100`);
          return response.json<{ data: { id: string }[] }>().data.map((item) => item.id);
        };
        expect(await ids(`refereeId=${referee.id}`)).toHaveLength(2);
        expect(await ids(`matchId=${match.id}`)).toEqual([created.json().id]);
        expect(await ids(`refereeId=${referee.id}&reimbursed=true`)).toEqual([created.json().id]);
        expect(await ids(`refereeId=${referee.id}&reimbursed=false`)).toEqual([second.json().id]);

        const cleared = await call(handles, actors.STAFF, 'PATCH', `/referee-assignments/${created.json().id}`, { reimbursedAt: null });
        expect(cleared.json().reimbursedAt).toBeNull();
        expect((await call(handles, actors.ADMIN, 'GET', `/referees/${referee.id}`)).json().assignmentsCount).toBe(2);
      });

      it('designates a referee for a match only once', async () => {
        const handles = get();
        const { ctx, actors, societyId } = handles;
        const referee = await ctx.prisma.referee.create({ data: { societyId, firstName: 'Uno', lastName: 'Solo' } });
        const match = await createMatch(ctx, societyId);
        const body = { refereeId: referee.id, matchId: match.id };
        expect((await call(handles, actors.ADMIN, 'POST', '/referee-assignments', body)).statusCode).toBe(201);
        const again = await call(handles, actors.ADMIN, 'POST', '/referee-assignments', body);
        expect(again.statusCode).toBe(409);
        expect(again.json()).toMatchObject({ code: 'referee_already_assigned' });
      });

      it('refuses unknown referees and matches, including those of another society', async () => {
        const handles = get();
        const { ctx, actors, societyId } = handles;
        const foreign = await createSociety(ctx, 'Arbitri estranei ASD');
        const foreignReferee = await ctx.prisma.referee.create({ data: { societyId: foreign.id, firstName: 'X', lastName: 'Y' } });
        const foreignMatch = await createMatch(ctx, foreign.id);
        const referee = await ctx.prisma.referee.create({ data: { societyId, firstName: 'Nostro', lastName: 'Arbitro' } });
        const match = await createMatch(ctx, societyId);
        expect((await call(handles, actors.ADMIN, 'POST', '/referee-assignments', { refereeId: foreignReferee.id, matchId: match.id })).statusCode).toBe(404);
        expect((await call(handles, actors.ADMIN, 'POST', '/referee-assignments', { refereeId: referee.id, matchId: foreignMatch.id })).statusCode).toBe(404);
      });

      it('keeps a referee that has designations: it must be released first', async () => {
        const handles = get();
        const { ctx, actors, societyId } = handles;
        const referee = await ctx.prisma.referee.create({ data: { societyId, firstName: 'Con', lastName: 'Storia' } });
        const match = await createMatch(ctx, societyId);
        const assignment = (await call(handles, actors.ADMIN, 'POST', '/referee-assignments', { refereeId: referee.id, matchId: match.id })).json();
        const blocked = await call(handles, actors.ADMIN, 'DELETE', `/referees/${referee.id}`);
        expect(blocked.statusCode).toBe(409);
        expect(blocked.json()).toMatchObject({ code: 'referee_has_assignments' });
        expect((await call(handles, actors.ADMIN, 'DELETE', `/referee-assignments/${assignment.id}`)).statusCode).toBe(204);
        expect((await call(handles, actors.ADMIN, 'DELETE', `/referees/${referee.id}`)).statusCode).toBe(204);
      });
    });
  },
);

