import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety, type Actor } from './helpers/factories.js';
import { createMatch } from './helpers/matches.js';

interface EntryDto {
  id: string;
  kind: string;
  category: string;
  description: string | null;
  supplier: string | null;
  notes: string | null;
  amountCents: number;
  occurredOn: string;
  source: string | null;
}

describe('expenses: the extra costs of the club and everything that weighs on the balance', () => {
  let ctx: TestContext;
  let societyId: string;
  let admin: Actor;
  let secretary: Actor;
  let outsider: Actor;

  const call = (actor: Actor, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    ctx.app.inject({ method, url: `${API}${url}`, headers: actor.headers, payload });
  const entries = async (query = ''): Promise<EntryDto[]> =>
    (await call(admin, 'GET', `/ledger/entries?limit=100${query}`)).json<{ data: EntryDto[] }>().data;
  const categories = async (kind: string, actor = admin) => (await call(actor, 'GET', `/ledger/categories?kind=${kind}`)).json<{ data: string[] }>().data;
  const spend = (payload: object, actor = admin) =>
    call(actor, 'POST', '/ledger/entries', { kind: 'EXPENSE', category: 'Attrezzatura sportiva', amountCents: 6400, occurredOn: '2026-10-05', ...payload });

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Spese ASD')).id;
    admin = await createActor(ctx, societyId, 'ADMIN');
    secretary = await createActor(ctx, societyId, 'SEGRETERIA');
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altre Spese ASD')).id, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('an expense with its name, supplier and notes', () => {
    it('keeps them, shows them, and lets them be changed or cleared', async () => {
      const created = await spend({ description: 'Palloni da gara', supplier: 'Volley Shop', notes: 'Fattura 118 del 3 ottobre' });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        kind: 'EXPENSE',
        category: 'Attrezzatura sportiva',
        description: 'Palloni da gara',
        supplier: 'Volley Shop',
        notes: 'Fattura 118 del 3 ottobre',
        source: null,
      });
      const id = created.json<{ id: string }>().id;

      const changed = await call(admin, 'PATCH', `/ledger/entries/${id}`, { supplier: 'Sport Center', notes: null });
      expect(changed.json()).toMatchObject({ supplier: 'Sport Center', notes: null, description: 'Palloni da gara' });
      expect((await call(admin, 'PATCH', `/ledger/entries/${id}`, { supplier: null })).json()).toMatchObject({ supplier: null });
    });

    it('refuses empty or oversized text and a zero amount', async () => {
      for (const bad of [{ supplier: '' }, { supplier: 'x'.repeat(121) }, { notes: 'y'.repeat(1001) }, { amountCents: 0 }]) {
        expect((await spend(bad)).statusCode, JSON.stringify(bad).slice(0, 40)).toBe(422);
      }
    });

    it('is for the administration only', async () => {
      expect((await spend({ description: 'Nastro' }, secretary)).statusCode).toBe(403);
      expect((await call(secretary, 'GET', '/ledger/categories?kind=EXPENSE')).statusCode).toBe(403);
    });

    it('counts in the balance of the year with its category', async () => {
      await spend({ description: 'Reti', category: 'Attrezzatura sportiva', amountCents: 10_000, occurredOn: '2031-02-02' });
      await spend({ description: 'Polizza', category: 'Assicurazioni', amountCents: 25_000, occurredOn: '2031-03-03' });
      const report = (await call(admin, 'GET', '/ledger/report?year=2031')).json<{
        totals: { expenseCents: number; balanceCents: number };
        categories: { kind: string; category: string; totalCents: number }[];
      }>();
      expect(report.totals).toMatchObject({ expenseCents: 35_000, balanceCents: -35_000 });
      expect(report.categories).toEqual([
        { kind: 'EXPENSE', category: 'Assicurazioni', totalCents: 25_000 },
        { kind: 'EXPENSE', category: 'Attrezzatura sportiva', totalCents: 10_000 },
      ]);
    });
  });

  describe('categories', () => {
    it('offers the usual ones, including the ones the costs of venues, kits, trips and referees go under', async () => {
      const expense = await categories('EXPENSE');
      for (const usual of ['Palestre', 'Divise', 'Trasferte', 'Arbitri', 'Attrezzatura sportiva', 'Assicurazioni', 'Altro']) {
        expect(expense).toContain(usual);
      }
      expect(await categories('INCOME')).toEqual(expect.arrayContaining(['Sponsor', 'Contributi']));
      expect(expense).toEqual([...expense].sort((a, b) => a.localeCompare(b, 'it')));
    });

    it('adds the ones the club has made up, once, and only to its own list', async () => {
      await spend({ description: 'Torneo estivo', category: 'Eventi del club' });
      await spend({ description: 'Torneo estivo 2', category: 'Eventi del club' });
      expect((await categories('EXPENSE')).filter((name) => name === 'Eventi del club')).toHaveLength(1);
      expect(await categories('INCOME')).not.toContain('Eventi del club');
      expect(await categories('EXPENSE', outsider)).not.toContain('Eventi del club');
    });

    it('takes the spelling of a category that already exists, whatever the capitals and spaces', async () => {
      const first = await spend({ description: 'Gazebo', category: '  attrezzatura   SPORTIVA ' });
      expect(first.json()).toMatchObject({ category: 'Attrezzatura sportiva' });
      const second = await spend({ description: 'Tabellone', category: 'Eventi  del   club' });
      expect(second.json()).toMatchObject({ category: 'Eventi del club' });
      const own = await spend({ description: 'Gadget', category: '  Materiale   promozionale ' });
      expect(own.json()).toMatchObject({ category: 'Materiale promozionale' });
      const again = await spend({ description: 'Gadget 2', category: 'materiale promozionale' });
      expect(again.json()).toMatchObject({ category: 'Materiale promozionale' });
    });

    it('does the same when an expense is moved to another category', async () => {
      const id = (await spend({ description: 'Cronometro' })).json<{ id: string }>().id;
      const moved = await call(admin, 'PATCH', `/ledger/entries/${id}`, { category: 'ASSICURAZIONI' });
      expect(moved.json()).toMatchObject({ category: 'Assicurazioni' });
      // changing only the kind keeps the category but looks it up among the ones of the new kind
      const toIncome = await call(admin, 'PATCH', `/ledger/entries/${id}`, { kind: 'INCOME', category: 'contributi' });
      expect(toIncome.json()).toMatchObject({ kind: 'INCOME', category: 'Contributi' });
    });

    it('needs the kind', async () => {
      expect((await call(admin, 'GET', '/ledger/categories')).statusCode).toBe(422);
      expect((await call(admin, 'GET', '/ledger/categories?kind=NOPE')).statusCode).toBe(422);
    });
  });

  describe('finding expenses', () => {
    it('searches the name, the supplier and the category', async () => {
      await spend({ description: 'Lavagna tattica', supplier: 'Cartoleria Lombardi', category: 'Ufficio e segreteria' });
      const names = async (q: string) => (await entries(`&q=${encodeURIComponent(q)}`)).map((entry) => entry.description);
      expect(await names('lavagna')).toEqual(['Lavagna tattica']);
      expect(await names('lombardi')).toEqual(['Lavagna tattica']);
      expect(await names('ufficio')).toContain('Lavagna tattica');
      expect(await names('zzzz')).toEqual([]);
    });

    it('tells the ones entered by hand from the ones that follow another section', async () => {
      const venue = await call(admin, 'POST', '/venues', { name: 'Palestra Filtro', costCents: 30_000, costDate: '2026-10-01' });
      expect(venue.statusCode).toBe(201);
      const linked = await entries('&origin=LINKED');
      const manual = await entries('&origin=MANUAL');
      expect(linked.length).toBeGreaterThan(0);
      expect(linked.every((entry) => entry.source !== null)).toBe(true);
      expect(linked.some((entry) => entry.description === 'Palestra Filtro')).toBe(true);
      expect(manual.length).toBeGreaterThan(0);
      expect(manual.every((entry) => entry.source === null)).toBe(true);
      expect(manual.some((entry) => entry.description === 'Palestra Filtro')).toBe(false);
    });
  });

  describe('the fee of a referee weighs on the balance', () => {
    const assign = async (payload: object = {}) => {
      const referee = await ctx.prisma.referee.create({ data: { societyId, firstName: 'Paola', lastName: `Fischio${Math.random().toString(36).slice(2, 7)}` } });
      const match = await createMatch(ctx, societyId, new Date('2026-11-14T19:30:00.000Z'));
      const response = await call(admin, 'POST', '/referee-assignments', { refereeId: referee.id, matchId: match.id, ...payload });
      expect(response.statusCode).toBe(201);
      return { id: response.json<{ id: string }>().id, referee };
    };
    const refereeEntries = async () => (await entries()).filter((entry) => entry.source === 'REFEREE');

    it('is booked on the day of the match under Arbitri, and follows the designation', async () => {
      const before = (await refereeEntries()).length;
      const { id, referee } = await assign({ feeCents: 4500 });
      const created = (await refereeEntries()).find((entry) => entry.description?.startsWith(`${referee.firstName} ${referee.lastName}`));
      expect(created).toMatchObject({
        kind: 'EXPENSE',
        category: 'Arbitri',
        amountCents: 4500,
        occurredOn: '2026-11-14',
        description: `${referee.firstName} ${referee.lastName} · Aquile - Delfini`,
      });
      expect((await refereeEntries()).length).toBe(before + 1);

      await call(admin, 'PATCH', `/referee-assignments/${id}`, { feeCents: 5000 });
      expect((await refereeEntries()).find((entry) => entry.id === created?.id)).toMatchObject({ amountCents: 5000 });

      // paying the referee back does not book it twice
      await call(admin, 'PATCH', `/referee-assignments/${id}`, { reimbursedAt: '2026-11-20T10:00:00.000Z' });
      expect((await refereeEntries()).length).toBe(before + 1);

      await call(admin, 'PATCH', `/referee-assignments/${id}`, { feeCents: null });
      expect((await refereeEntries()).length).toBe(before);
      await call(admin, 'PATCH', `/referee-assignments/${id}`, { feeCents: 4000 });
      expect((await refereeEntries()).length).toBe(before + 1);

      expect((await call(admin, 'DELETE', `/referee-assignments/${id}`)).statusCode).toBe(204);
      expect((await refereeEntries()).length).toBe(before);
    });

    it('is not booked for a designation without a fee', async () => {
      const before = (await refereeEntries()).length;
      await assign();
      await assign({ feeCents: 0 });
      expect((await refereeEntries()).length).toBe(before);
    });

    it('cannot be edited or deleted from the balance: it is changed on the designation', async () => {
      await assign({ feeCents: 3000 });
      const entry = (await refereeEntries())[0];
      expect(entry).toBeDefined();
      for (const request of [
        call(admin, 'PATCH', `/ledger/entries/${entry?.id}`, { amountCents: 1 }),
        call(admin, 'DELETE', `/ledger/entries/${entry?.id}`),
      ]) {
        const response = await request;
        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({ code: 'ledger_entry_linked' });
      }
    });

    it('does not show up in another society', async () => {
      await assign({ feeCents: 2000 });
      expect((await call(outsider, 'GET', '/ledger/entries?limit=100')).json<{ data: EntryDto[] }>().data).toEqual([]);
    });
  });

  describe('every cost that weighs on the balance is in the balance', () => {
    it('lists venues, kits, trips and referees as expenses under their own category, read-only', async () => {
      const kit = await call(admin, 'POST', '/kits', { item: 'Maglia gara', costCents: 12_000, costDate: '2026-09-01' });
      const trip = await call(admin, 'POST', '/trips', { destination: 'Ferrara', departAt: '2026-12-05T15:00:00.000Z', costCents: 6500 });
      expect(kit.statusCode).toBe(201);
      expect(trip.statusCode).toBe(201);
      const linked = await entries('&origin=LINKED');
      const bySource = (source: string) => linked.filter((entry) => entry.source === source);
      expect(bySource('KIT').every((entry) => entry.category === 'Divise')).toBe(true);
      expect(bySource('TRIP').every((entry) => entry.category === 'Trasferte')).toBe(true);
      expect(bySource('VENUE').every((entry) => entry.category === 'Palestre')).toBe(true);
      expect(bySource('REFEREE').every((entry) => entry.category === 'Arbitri')).toBe(true);
      expect(bySource('KIT').length + bySource('TRIP').length).toBeGreaterThanOrEqual(2);
      expect(linked.every((entry) => entry.kind === 'EXPENSE')).toBe(true);
    });
  });
});
