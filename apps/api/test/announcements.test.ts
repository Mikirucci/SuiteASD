import { describe, expect, it } from 'vitest';
import { API } from './helpers/app.js';
import { describeCrudModule } from './helpers/crud-suite.js';
import { createActor, createMember, createSociety, createTeam } from './helpers/factories.js';

describeCrudModule(
  {
    title: 'announcements',
    path: '/announcements',
    readRoles: ['ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF', 'ATLETA', 'GENITORE'],
    writeRoles: ['ADMIN', 'SEGRETERIA', 'ALLENATORE'],
    createPayload: ({ n }) => ({ title: `Comunicazione ${n}`, body: 'Allenamento di giovedi in palestra.', isPinned: false }),
    expectedFromPayload: (payload) => ({ ...payload, status: 'PUBLISHED' }),
    invalidPayload: { title: '  ', body: '' },
    invalidFields: ['title', 'body'],
    patch: { payload: { title: 'Titolo nuovo', isPinned: true }, expected: { title: 'Titolo nuovo', isPinned: true } },
  },
  (get) => {
    describe('announcements rules (SPEC "Bacheca")', () => {
      const send = (method: 'GET' | 'POST' | 'PATCH', actor: { headers: { authorization: string } }, path: string, payload?: object) =>
        get().ctx.app.inject({ method, url: `${API}${path}`, headers: actor.headers, payload });

      it('publishes at once by default, keeps drafts and scheduled posts hidden from readers, and shows the author', async () => {
        const { actors } = get();
        const now = Date.now();
        const published = (await send('POST', actors.ALLENATORE, '/announcements', { title: 'Visibile', body: 'ora' })).json();
        const draft = (await send('POST', actors.ALLENATORE, '/announcements', { title: 'Bozza', body: 'x', publishedAt: null })).json();
        const scheduled = (
          await send('POST', actors.ALLENATORE, '/announcements', {
            title: 'Programmata',
            body: 'x',
            publishedAt: new Date(now + 86_400_000).toISOString(),
          })
        ).json();
        expect(published).toMatchObject({ status: 'PUBLISHED', authorId: actors.ALLENATORE.user.id, authorName: 'Test ALLENATORE' });
        expect(draft).toMatchObject({ status: 'DRAFT', publishedAt: null });
        expect(scheduled.status).toBe('SCHEDULED');

        const athleteIds = (await send('GET', actors.ATLETA, '/announcements?limit=100')).json().data.map((item: { id: string }) => item.id);
        expect(athleteIds).toContain(published.id);
        expect(athleteIds).not.toContain(draft.id);
        expect(athleteIds).not.toContain(scheduled.id);
        expect((await send('GET', actors.ATLETA, `/announcements/${draft.id}`)).statusCode).toBe(404);
        expect((await send('GET', actors.STAFF, `/announcements/${scheduled.id}`)).statusCode).toBe(404);

        const managerIds = (await send('GET', actors.ALLENATORE, '/announcements?limit=100')).json().data.map((item: { id: string }) => item.id);
        expect(managerIds).toEqual(expect.arrayContaining([published.id, draft.id, scheduled.id]));
        const drafts = (await send('GET', actors.ADMIN, '/announcements?status=DRAFT&limit=100')).json().data;
        expect(drafts.every((item: { status: string }) => item.status === 'DRAFT')).toBe(true);
        expect(drafts.map((item: { id: string }) => item.id)).toContain(draft.id);
      });

      it('lists pinned announcements first', async () => {
        const { actors } = get();
        await send('POST', actors.ADMIN, '/announcements', { title: 'Normale', body: 'x' });
        const pinned = (await send('POST', actors.ADMIN, '/announcements', { title: 'In evidenza', body: 'x', isPinned: true })).json();
        const first = (await send('GET', actors.ATLETA, '/announcements?limit=1')).json().data[0];
        expect(first.id).toBe(pinned.id);
      });

      it('notifies the whole society on publication, except the author, once even after an update', async () => {
        const { ctx, actors } = get();
        const before = await ctx.prisma.notification.count({ where: { type: 'ANNOUNCEMENT', userId: actors.ATLETA.user.id, channel: 'IN_APP' } });
        const created = (await send('POST', actors.SEGRETERIA, '/announcements', { title: 'Cena sociale', body: 'Venerdi alle 20 al club.' })).json();
        const rows = await ctx.prisma.notification.findMany({ where: { dedupeKey: `announcement:${created.id}`, channel: 'IN_APP' } });
        expect(rows.map((row) => row.userId)).toContain(actors.ATLETA.user.id);
        expect(rows.map((row) => row.userId)).not.toContain(actors.SEGRETERIA.user.id);
        expect(rows[0]).toMatchObject({ title: 'Cena sociale', body: 'Venerdi alle 20 al club.', data: { announcementId: created.id } });
        expect(await ctx.prisma.notification.count({ where: { type: 'ANNOUNCEMENT', userId: actors.ATLETA.user.id, channel: 'IN_APP' } })).toBe(before + 1);

        await send('PATCH', actors.SEGRETERIA, `/announcements/${created.id}`, { body: 'Corretto: alle 20:30.' });
        expect(await ctx.prisma.notification.count({ where: { dedupeKey: `announcement:${created.id}`, channel: 'IN_APP' } })).toBe(rows.length);
      });

      it('notifies only when a draft or scheduled post becomes published', async () => {
        const { ctx, actors } = get();
        const draft = (await send('POST', actors.ADMIN, '/announcements', { title: 'Futura', body: 'x', publishedAt: null })).json();
        expect(await ctx.prisma.notification.count({ where: { dedupeKey: `announcement:${draft.id}` } })).toBe(0);
        const published = await send('PATCH', actors.ADMIN, `/announcements/${draft.id}`, { publishedAt: new Date().toISOString() });
        expect(published.json().status).toBe('PUBLISHED');
        expect(await ctx.prisma.notification.count({ where: { dedupeKey: `announcement:${draft.id}`, channel: 'IN_APP' } })).toBeGreaterThan(0);
      });

      it('addresses a single team: its athletes and guardians are notified and see it, the others do not', async () => {
        const { ctx } = get();
        const society = await createSociety(ctx, 'Bacheca squadre ASD');
        const admin = await createActor(ctx, society.id, 'ADMIN');
        const insideAthlete = await createActor(ctx, society.id, 'ATLETA');
        const insideGuardian = await createActor(ctx, society.id, 'GENITORE');
        const outsideAthlete = await createActor(ctx, society.id, 'ATLETA');
        const team = await createTeam(ctx, society.id, 'U16');
        const otherTeam = await createTeam(ctx, society.id, 'U18');
        const inside = await createMember(ctx, society.id, { userId: insideAthlete.user.id });
        const outside = await createMember(ctx, society.id, { firstName: 'Fuori', userId: outsideAthlete.user.id });
        await ctx.prisma.guardianLink.create({ data: { societyId: society.id, guardianUserId: insideGuardian.user.id, memberId: inside.id } });
        await ctx.prisma.teamMembership.create({ data: { societyId: society.id, teamId: team.id, memberId: inside.id } });
        await ctx.prisma.teamMembership.create({ data: { societyId: society.id, teamId: otherTeam.id, memberId: outside.id } });

        const created = (await send('POST', admin, '/announcements', { title: 'Solo U16', body: 'Trasferta', teamId: team.id })).json();
        expect(created).toMatchObject({ teamId: team.id, teamName: 'U16' });
        const notified = await ctx.prisma.notification.findMany({ where: { dedupeKey: `announcement:${created.id}`, channel: 'IN_APP' } });
        expect(notified.map((row) => row.userId).sort()).toEqual([insideAthlete.user.id, insideGuardian.user.id].sort());

        for (const [actor, visible] of [
          [insideAthlete, true],
          [insideGuardian, true],
          [outsideAthlete, false],
        ] as const) {
          const response = await send('GET', actor, `/announcements/${created.id}`);
          expect(response.statusCode).toBe(visible ? 200 : 404);
        }
        const outsideList = (await send('GET', outsideAthlete, '/announcements')).json().data;
        expect(outsideList.map((item: { id: string }) => item.id)).not.toContain(created.id);
      });

      it('rejects a team of another society and filters by team', async () => {
        const { ctx, actors } = get();
        const foreignSociety = await createSociety(ctx, 'Squadra estranea ASD');
        const foreignTeam = await createTeam(ctx, foreignSociety.id);
        expect((await send('POST', actors.ADMIN, '/announcements', { title: 'x', body: 'y', teamId: foreignTeam.id })).statusCode).toBe(404);
        expect((await send('PATCH', actors.ADMIN, '/announcements/none', { teamId: foreignTeam.id })).statusCode).toBe(404);

        const team = await createTeam(ctx, actors.ADMIN.societyId, 'Filtro squadra');
        const mine = (await send('POST', actors.ADMIN, '/announcements', { title: 'Per squadra', body: 'x', teamId: team.id })).json();
        const filtered = (await send('GET', actors.ADMIN, `/announcements?teamId=${team.id}`)).json().data;
        expect(filtered.map((item: { id: string }) => item.id)).toEqual([mine.id]);
      });
    });
  },
);
