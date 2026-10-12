import { describe, expect, it } from 'vitest';
import { API } from './helpers/app.js';
import { describeCrudModule } from './helpers/crud-suite.js';

describeCrudModule(
  {
    title: 'trips',
    path: '/trips',
    readRoles: ['ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF', 'ATLETA', 'GENITORE'],
    writeRoles: ['ADMIN', 'STAFF'],
    createPayload: ({ n }) => ({
      destination: `Palasport Trasferta ${n}`,
      departAt: '2026-11-14T15:00:00.000Z',
      returnAt: '2026-11-14T23:30:00.000Z',
      transport: 'MINIBUS',
      seats: 9,
      costCents: 12_000,
    }),
    invalidPayload: { destination: '', departAt: 'tomorrow', transport: 'PLANE', seats: 0 },
    invalidFields: ['destination', 'departAt', 'transport', 'seats'],
    patch: {
      payload: { status: 'CONFIRMED', costCents: null, seats: 12 },
      expected: { status: 'CONFIRMED', costCents: null, seats: 12, transport: 'MINIBUS' },
    },
  },
  (get) => {
    describe('trips rules', () => {
      it('defaults to a planned car trip', async () => {
        const { ctx, actors } = get();
        const response = await ctx.app.inject({
          method: 'POST',
          url: `${API}/trips`,
          headers: actors.STAFF.headers,
          payload: { destination: 'Cesena', departAt: '2026-12-01T09:00:00.000Z' },
        });
        expect(response.json()).toMatchObject({ transport: 'CAR', status: 'PLANNED', returnAt: null, seats: null, eventId: null });
      });

      it('rejects a return before the departure, also in a PATCH', async () => {
        const { ctx, actors } = get();
        const create = await ctx.app.inject({
          method: 'POST',
          url: `${API}/trips`,
          headers: actors.STAFF.headers,
          payload: { destination: 'X', departAt: '2026-12-01T09:00:00.000Z', returnAt: '2026-12-01T08:00:00.000Z' },
        });
        expect(create.statusCode).toBe(422);
        const ok = await ctx.app.inject({
          method: 'POST',
          url: `${API}/trips`,
          headers: actors.STAFF.headers,
          payload: { destination: 'Y', departAt: '2026-12-01T09:00:00.000Z' },
        });
        const patch = await ctx.app.inject({
          method: 'PATCH',
          url: `${API}/trips/${ok.json().id}`,
          headers: actors.STAFF.headers,
          payload: { departAt: '2026-12-02T09:00:00.000Z', returnAt: '2026-12-01T10:00:00.000Z' },
        });
        expect(patch.statusCode).toBe(422);
      });

      it('links a trip to an event of the same society only', async () => {
        const { ctx, actors, societyId, outsider } = get();
        const event = await ctx.prisma.event.create({
          data: { societyId, type: 'MATCH', title: 'Trasferta', startsAt: new Date('2026-12-05T18:00:00.000Z') },
        });
        const payload = { destination: 'Con evento', departAt: '2026-12-05T14:00:00.000Z', eventId: event.id };
        const own = await ctx.app.inject({ method: 'POST', url: `${API}/trips`, headers: actors.STAFF.headers, payload });
        expect(own.statusCode).toBe(201);
        expect(own.json()).toMatchObject({ eventId: event.id });
        const foreign = await ctx.app.inject({ method: 'POST', url: `${API}/trips`, headers: outsider.headers, payload });
        expect(foreign.statusCode).toBe(404);
        const patchForeign = await ctx.app.inject({
          method: 'PATCH',
          url: `${API}/trips/${own.json().id}`,
          headers: outsider.headers,
          payload: { eventId: null },
        });
        expect(patchForeign.statusCode).toBe(404);
      });

      it('filters by status, event and departure window', async () => {
        const { ctx, actors, societyId } = get();
        await ctx.prisma.trip.createMany({
          data: [
            { societyId, destination: 'Win A', departAt: new Date('2027-03-01T10:00:00Z'), status: 'PLANNED' },
            { societyId, destination: 'Win B', departAt: new Date('2027-03-10T10:00:00Z'), status: 'CANCELLED' },
            { societyId, destination: 'Win C', departAt: new Date('2027-04-01T10:00:00Z'), status: 'PLANNED' },
          ],
        });
        const destinations = async (query: string) => {
          const response = await ctx.app.inject({ method: 'GET', url: `${API}/trips?${query}`, headers: actors.ATLETA.headers });
          return response.json<{ data: { destination: string }[] }>().data.map((trip) => trip.destination);
        };
        expect(await destinations('from=2027-03-01T00:00:00Z&to=2027-03-31T00:00:00Z')).toEqual(['Win A', 'Win B']);
        expect(await destinations('from=2027-03-01T00:00:00Z&status=PLANNED')).toEqual(['Win A', 'Win C']);
      });
    });
  },
);
