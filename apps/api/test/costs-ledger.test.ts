import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, type Actor } from './helpers/factories.js';

interface EntryDto {
  id: string;
  kind: string;
  category: string;
  description: string | null;
  amountCents: number;
  occurredOn: string;
  source: string | null;
}

const todayKey = (): string => new Date().toISOString().slice(0, 10);

describe('costs of venues, kits and trips weigh on the balance', () => {
  let ctx: TestContext;
  let admin: Actor;
  let outsider: Actor;

  const call = (actor: Actor, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    ctx.app.inject({ method, url: `${API}${url}`, headers: actor.headers, payload });

  async function entries(actor = admin): Promise<EntryDto[]> {
    return (await call(actor, 'GET', '/ledger/entries?limit=100')).json<{ data: EntryDto[] }>().data;
  }

  const expenses = async (category: string) => (await entries()).filter((entry) => entry.category === category);

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await createActor(ctx, (await createSociety(ctx, 'Costi ASD')).id, 'ADMIN');
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altra Costi ASD')).id, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('venues', () => {
    it('books the cost as an expense on the given day, and follows every change of the venue', async () => {
      const created = await call(admin, 'POST', '/venues', { name: 'Palazzetto', costCents: 45_000, costDate: '2026-03-10' });
      expect(created.statusCode).toBe(201);
      const venue = created.json<{ id: string; costCents: number; costDate: string }>();
      expect(venue).toMatchObject({ costCents: 45_000, costDate: '2026-03-10' });
      expect(await expenses('Palestre')).toEqual([
        expect.objectContaining({ kind: 'EXPENSE', description: 'Palazzetto', amountCents: 45_000, occurredOn: '2026-03-10', source: 'VENUE' }),
      ]);

      await call(admin, 'PATCH', `/venues/${venue.id}`, { name: 'Palazzetto Nord', costCents: 50_000 });
      expect(await expenses('Palestre')).toEqual([
        expect.objectContaining({ description: 'Palazzetto Nord', amountCents: 50_000, occurredOn: '2026-03-10' }),
      ]);

      await call(admin, 'PATCH', `/venues/${venue.id}`, { costDate: '2026-04-01' });
      expect((await expenses('Palestre'))[0]).toMatchObject({ amountCents: 50_000, occurredOn: '2026-04-01' });

      const cleared = await call(admin, 'PATCH', `/venues/${venue.id}`, { costCents: null });
      expect(cleared.json()).toMatchObject({ costCents: null, costDate: null });
      expect(await expenses('Palestre')).toEqual([]);
    });

    it('books a cost without a date today, and removes the expense together with the venue', async () => {
      const venue = (await call(admin, 'POST', '/venues', { name: 'Campo B', costCents: 12_000 })).json<{ id: string; costDate: string }>();
      expect(venue.costDate).toBe(todayKey());
      expect(await expenses('Palestre')).toHaveLength(1);
      expect((await call(admin, 'DELETE', `/venues/${venue.id}`)).statusCode).toBe(204);
      expect(await expenses('Palestre')).toEqual([]);
    });

    it('records no expense for a venue without a cost', async () => {
      const venue = (await call(admin, 'POST', '/venues', { name: 'Gratis' })).json();
      expect(venue).toMatchObject({ costCents: null, costDate: null });
      expect(await expenses('Palestre')).toEqual([]);
    });

    it('rejects a zero or negative cost', async () => {
      expect((await call(admin, 'POST', '/venues', { name: 'Zero', costCents: 0 })).statusCode).toBe(422);
      expect((await call(admin, 'POST', '/venues', { name: 'Meno', costCents: -5 })).statusCode).toBe(422);
    });
  });

  describe('kits', () => {
    it('books the cost under Divise with the name of the piece', async () => {
      const created = await call(admin, 'POST', '/kits', { item: 'Maglia gara', size: 'M', number: 7, costCents: 2_500, costDate: '2026-05-02' });
      const kit = created.json<{ id: string; costCents: number }>();
      expect(kit.costCents).toBe(2_500);
      expect(await expenses('Divise')).toEqual([
        expect.objectContaining({ kind: 'EXPENSE', description: 'Maglia gara M n. 7', amountCents: 2_500, occurredOn: '2026-05-02', source: 'KIT' }),
      ]);
      await call(admin, 'PATCH', `/kits/${kit.id}`, { costCents: 3_000, size: 'L' });
      expect(await expenses('Divise')).toEqual([expect.objectContaining({ description: 'Maglia gara L n. 7', amountCents: 3_000 })]);
      expect((await call(admin, 'DELETE', `/kits/${kit.id}`)).statusCode).toBe(204);
      expect(await expenses('Divise')).toEqual([]);
    });

    it('groups the pieces by item with how many are assigned, in stock and what they cost', async () => {
      const member = await createMember(ctx, admin.societyId, { firstName: 'Giulia', lastName: 'Rossi' });
      await call(admin, 'POST', '/kits', { item: 'Tuta', costCents: 4_000 });
      await call(admin, 'POST', '/kits', { item: 'Tuta', memberId: member.id, costCents: 4_000 });
      await call(admin, 'POST', '/kits', { item: 'Tuta' });
      await call(admin, 'POST', '/kits', { item: 'Borsa', memberId: member.id });

      const groups = (await call(admin, 'GET', '/kits/groups')).json<{ data: unknown[] }>().data;
      expect(groups).toEqual([
        { item: 'Borsa', total: 1, assigned: 1, inStock: 0, totalCostCents: 0 },
        { item: 'Tuta', total: 3, assigned: 1, inStock: 2, totalCostCents: 8_000 },
      ]);
      expect((await call(admin, 'GET', '/kits?item=Tuta&limit=50')).json<{ data: unknown[] }>().data).toHaveLength(3);
      expect((await call(outsider, 'GET', '/kits/groups')).json()).toEqual({ data: [] });
    });
  });

  describe('trips', () => {
    const departure = '2026-06-14T06:30:00.000Z';

    it('books the cost on the day of departure and drops it when the trip is cancelled', async () => {
      const created = await call(admin, 'POST', '/trips', { destination: 'Bologna', departAt: departure, costCents: 18_000 });
      const trip = created.json<{ id: string }>();
      expect(await expenses('Trasferte')).toEqual([
        expect.objectContaining({ kind: 'EXPENSE', description: 'Bologna', amountCents: 18_000, occurredOn: '2026-06-14', source: 'TRIP' }),
      ]);

      await call(admin, 'PATCH', `/trips/${trip.id}`, { status: 'CANCELLED' });
      expect(await expenses('Trasferte')).toEqual([]);

      await call(admin, 'PATCH', `/trips/${trip.id}`, { status: 'CONFIRMED', costCents: 20_000, departAt: '2026-06-15T06:30:00.000Z' });
      expect(await expenses('Trasferte')).toEqual([expect.objectContaining({ amountCents: 20_000, occurredOn: '2026-06-15' })]);

      await call(admin, 'PATCH', `/trips/${trip.id}`, { costCents: 0 });
      expect(await expenses('Trasferte')).toEqual([]);
    });

    it('removes the expense together with the trip', async () => {
      const trip = (await call(admin, 'POST', '/trips', { destination: 'Modena', departAt: departure, costCents: 9_000 })).json<{ id: string }>();
      expect(await expenses('Trasferte')).toHaveLength(1);
      await call(admin, 'DELETE', `/trips/${trip.id}`);
      expect(await expenses('Trasferte')).toEqual([]);
    });
  });

  describe('the balance', () => {
    it('counts the linked expenses in the yearly report', async () => {
      await call(admin, 'POST', '/venues', { name: 'Palestra report', costCents: 10_000, costDate: '2031-02-01' });
      await call(admin, 'POST', '/trips', { destination: 'Report', departAt: '2031-03-01T08:00:00.000Z', costCents: 5_000 });
      const report = (await call(admin, 'GET', '/ledger/report?year=2031')).json<{
        totals: { expenseCents: number };
        categories: { category: string; totalCents: number }[];
      }>();
      expect(report.totals.expenseCents).toBe(15_000);
      expect(report.categories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'Palestre', totalCents: 10_000 }),
          expect.objectContaining({ category: 'Trasferte', totalCents: 5_000 }),
        ]),
      );
    });

    it('refuses to edit or delete an entry that belongs to a venue, kit or trip, and shows where it comes from', async () => {
      const venue = (await call(admin, 'POST', '/venues', { name: 'Intoccabile', costCents: 1_000, costDate: '2026-07-01' })).json<{ id: string }>();
      const entry = (await entries()).find((candidate) => candidate.description === 'Intoccabile');
      expect(entry).toMatchObject({ source: 'VENUE' });
      const edit = await call(admin, 'PATCH', `/ledger/entries/${entry?.id}`, { amountCents: 9_999 });
      expect(edit.statusCode).toBe(409);
      expect(edit.json()).toMatchObject({ code: 'ledger_entry_linked' });
      expect((await call(admin, 'DELETE', `/ledger/entries/${entry?.id}`)).statusCode).toBe(409);
      await call(admin, 'DELETE', `/venues/${venue.id}`);
    });

    it('still lets the administration edit its own manual entries', async () => {
      const created = await call(admin, 'POST', '/ledger/entries', { kind: 'EXPENSE', category: 'Varie', amountCents: 700, occurredOn: '2026-08-01' });
      const entry = created.json<EntryDto>();
      expect(entry.source).toBeNull();
      expect((await call(admin, 'PATCH', `/ledger/entries/${entry.id}`, { amountCents: 800 })).statusCode).toBe(200);
      expect((await call(admin, 'DELETE', `/ledger/entries/${entry.id}`)).statusCode).toBe(204);
    });
  });
});
