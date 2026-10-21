import { describe, expect, it } from 'vitest';
import { API } from './helpers/app.js';
import { describeCrudModule } from './helpers/crud-suite.js';
import { createMember } from './helpers/factories.js';

describeCrudModule(
  {
    title: 'kits',
    path: '/kits',
    readRoles: ['ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF'],
    writeRoles: ['ADMIN', 'STAFF'],
    createPayload: ({ n }) => ({ item: `Maglia gara ${n}`, size: 'M', number: 7, condition: 'Nuova' }),
    invalidPayload: { item: '', number: 100 },
    invalidFields: ['item', 'number'],
    patch: { payload: { condition: 'Usurata', size: null }, expected: { condition: 'Usurata', size: null, number: 7 } },
  },
  (get) => {
    describe('kits assignment', () => {
      it('assigns an item to a member, keeps the date while the holder is unchanged and clears it on return', async () => {
        const { ctx, actors, societyId } = get();
        const member = await createMember(ctx, societyId, { firstName: 'Giulia', lastName: 'Rossi' });
        const created = await ctx.app.inject({
          method: 'POST',
          url: `${API}/kits`,
          headers: actors.STAFF.headers,
          payload: { item: 'Tuta', size: 'S', memberId: member.id },
        });
        expect(created.statusCode).toBe(201);
        const kit = created.json();
        expect(kit).toMatchObject({ memberId: member.id, member: { firstName: 'Giulia', lastName: 'Rossi' } });
        expect(kit.assignedAt).not.toBeNull();

        const same = await ctx.app.inject({
          method: 'PATCH',
          url: `${API}/kits/${kit.id}`,
          headers: actors.STAFF.headers,
          payload: { memberId: member.id, notes: 'ok' },
        });
        expect(same.json().assignedAt).toBe(kit.assignedAt);

        const returned = await ctx.app.inject({
          method: 'PATCH',
          url: `${API}/kits/${kit.id}`,
          headers: actors.STAFF.headers,
          payload: { memberId: null },
        });
        expect(returned.json()).toMatchObject({ memberId: null, member: null, assignedAt: null });
      });

      it('filters the stock and the assigned items', async () => {
        const { ctx, actors, societyId } = get();
        const member = await createMember(ctx, societyId, {
          firstName: 'Sara',
          lastName: 'Conti',
          fiscalCode: 'CNTSRA00A41H501Z',
        });
        await ctx.prisma.kit.createMany({
          data: [
            { societyId, item: 'Borsa stock' },
            { societyId, item: 'Borsa assegnata', memberId: member.id, assignedAt: new Date() },
          ],
        });
        const items = async (query: string) => {
          const response = await ctx.app.inject({
            method: 'GET',
            url: `${API}/kits?q=Borsa&${query}`,
            headers: actors.ALLENATORE.headers,
          });
          return response.json<{ data: { item: string }[] }>().data.map((kit) => kit.item);
        };
        expect(await items('assigned=false')).toEqual(['Borsa stock']);
        expect(await items('assigned=true')).toEqual(['Borsa assegnata']);
        expect(await items(`memberId=${member.id}`)).toEqual(['Borsa assegnata']);
        expect(await items('')).toHaveLength(2);
      });

      it('searches by item, by size and by the name of who holds the piece', async () => {
        const { ctx, actors, societyId } = get();
        const holder = await createMember(ctx, societyId, { firstName: 'Ludovica', lastName: 'Zanetti', fiscalCode: 'ZNTLVC00A41H501K' });
        await ctx.prisma.kit.createMany({
          data: [
            { societyId, item: 'Pantaloncini ricerca', size: 'XXL' },
            { societyId, item: 'Calze ricerca', size: 'S', memberId: holder.id, assignedAt: new Date() },
          ],
        });
        const found = async (query: string) =>
          (await ctx.app.inject({ method: 'GET', url: `${API}/kits?${query}`, headers: actors.ALLENATORE.headers }))
            .json<{ data: { item: string }[] }>()
            .data.map((kit) => kit.item);
        expect(await found('q=XXL')).toEqual(['Pantaloncini ricerca']);
        expect(await found('q=Zanetti')).toEqual(['Calze ricerca']);
        expect(await found('q=ricerca&assigned=true')).toEqual(['Calze ricerca']);
        expect(await found('item=Calze%20ricerca')).toEqual(['Calze ricerca']);
      });

      it('refuses to assign to a member of another society', async () => {
        const { ctx, actors, societyId, outsider } = get();
        const member = await createMember(ctx, societyId, { fiscalCode: 'FRRNNA00A41H501Y' });
        const foreign = await ctx.app.inject({
          method: 'POST',
          url: `${API}/kits`,
          headers: outsider.headers,
          payload: { item: 'Spy', memberId: member.id },
        });
        expect(foreign.statusCode).toBe(404);
        const own = await ctx.app.inject({
          method: 'POST',
          url: `${API}/kits`,
          headers: actors.ADMIN.headers,
          payload: { item: 'Own' },
        });
        const patch = await ctx.app.inject({
          method: 'PATCH',
          url: `${API}/kits/${own.json().id}`,
          headers: outsider.headers,
          payload: { memberId: member.id },
        });
        expect(patch.statusCode).toBe(404);
      });
    });
  },
);
