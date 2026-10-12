import { describe, expect, it } from 'vitest';
import { API } from './helpers/app.js';
import { describeCrudModule } from './helpers/crud-suite.js';

describeCrudModule(
  {
    title: 'venues',
    path: '/venues',
    readRoles: ['ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF', 'ATLETA', 'GENITORE'],
    writeRoles: ['ADMIN', 'SEGRETERIA', 'STAFF'],
    createPayload: ({ n }) => ({
      name: `Palazzetto ${n}`,
      address: 'Via dello Sport 1',
      city: 'Bologna',
      capacity: 300,
      availability: 'Mar e Gio 18:00-21:00',
    }),
    invalidPayload: { name: '  ', capacity: 0 },
    invalidFields: ['name', 'capacity'],
    patch: { payload: { name: 'Palestra Nord', capacity: null }, expected: { name: 'Palestra Nord', capacity: null, city: 'Bologna' } },
  },
  (get) => {
    describe('venues filters', () => {
      it('filters by a substring of name or city', async () => {
        const { ctx, actors } = get();
        await ctx.prisma.venue.createMany({
          data: [
            { societyId: actors.ADMIN.societyId, name: 'Filtro Centrale', city: 'Modena' },
            { societyId: actors.ADMIN.societyId, name: 'Filtro Est', city: 'Parma' },
          ],
        });
        const response = await ctx.app.inject({ method: 'GET', url: `${API}/venues?q=Parma`, headers: actors.ATLETA.headers });
        expect(response.json().data.map((venue: { name: string }) => venue.name)).toEqual(['Filtro Est']);
      });
    });
  },
);
