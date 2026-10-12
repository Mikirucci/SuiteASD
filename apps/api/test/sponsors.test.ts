import { describe, expect, it } from 'vitest';
import { API } from './helpers/app.js';
import { describeCrudModule } from './helpers/crud-suite.js';

describeCrudModule(
  {
    title: 'sponsors',
    path: '/sponsors',
    readRoles: ['ADMIN'],
    writeRoles: ['ADMIN'],
    createPayload: ({ n }) => ({
      name: `Sponsor ${n}`,
      contactName: 'Mario Bianchi',
      email: 'sponsor@example.test',
      amountCents: 250_000,
      contractStart: '2026-09-01',
      contractEnd: '2027-06-30',
      status: 'ACTIVE',
    }),
    invalidPayload: { name: '', amountCents: -5, email: 'not-an-email', status: 'GOLD' },
    invalidFields: ['name', 'amountCents', 'email', 'status'],
    patch: {
      payload: { amountCents: 300_000, status: 'EXPIRED', contactName: null },
      expected: { amountCents: 300_000, status: 'EXPIRED', contactName: null, contractEnd: '2027-06-30' },
    },
  },
  (get) => {
    describe('sponsors rules', () => {
      it('defaults amount to 0 and status to ACTIVE', async () => {
        const { ctx, actors } = get();
        const response = await ctx.app.inject({
          method: 'POST',
          url: `${API}/sponsors`,
          headers: actors.ADMIN.headers,
          payload: { name: 'Bar Sport' },
        });
        expect(response.json()).toMatchObject({ amountCents: 0, status: 'ACTIVE', contractStart: null, contractEnd: null });
      });

      it('rejects a contract that ends before it starts, also in a PATCH', async () => {
        const { ctx, actors } = get();
        const create = await ctx.app.inject({
          method: 'POST',
          url: `${API}/sponsors`,
          headers: actors.ADMIN.headers,
          payload: { name: 'Bad dates', contractStart: '2026-10-01', contractEnd: '2026-09-01' },
        });
        expect(create.statusCode).toBe(422);
        const ok = await ctx.app.inject({ method: 'POST', url: `${API}/sponsors`, headers: actors.ADMIN.headers, payload: { name: 'Dates' } });
        const patch = await ctx.app.inject({
          method: 'PATCH',
          url: `${API}/sponsors/${ok.json().id}`,
          headers: actors.ADMIN.headers,
          payload: { contractStart: '2026-10-01', contractEnd: '2026-09-01' },
        });
        expect(patch.statusCode).toBe(422);
      });

      it('filters by status, name and contract expiry', async () => {
        const { ctx, actors, societyId } = get();
        await ctx.prisma.sponsor.createMany({
          data: [
            { societyId, name: 'Filter Alfa', status: 'ACTIVE', contractEnd: new Date('2026-12-31') },
            { societyId, name: 'Filter Beta', status: 'EXPIRED', contractEnd: new Date('2025-06-30') },
            { societyId, name: 'Filter Gamma', status: 'PROSPECT' },
          ],
        });
        const names = async (query: string) => {
          const response = await ctx.app.inject({ method: 'GET', url: `${API}/sponsors?${query}`, headers: actors.ADMIN.headers });
          return response.json<{ data: { name: string }[] }>().data.map((sponsor) => sponsor.name);
        };
        expect(await names('q=Filter&status=PROSPECT')).toEqual(['Filter Gamma']);
        expect(await names('q=Filter&expiresBefore=2026-01-01')).toEqual(['Filter Beta']);
        expect(await names('q=Filter')).toHaveLength(3);
      });
    });
  },
);
