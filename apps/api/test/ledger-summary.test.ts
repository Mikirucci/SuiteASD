import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLedgerSummary, type SummaryEntry } from '../src/modules/ledger/summary.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety, type Actor } from './helpers/factories.js';

interface SummaryDto {
  totalCents: number;
  count: number;
  manualCents: number;
  linkedCents: number;
  categories: { category: string; totalCents: number; count: number; firstOn: string; lastOn: string; names: string[] }[];
}

const entry = (overrides: Partial<SummaryEntry>): SummaryEntry => ({
  category: 'Utenze',
  amountCents: 1000,
  linked: false,
  description: null,
  occurredOn: '2031-03-01',
  ...overrides,
});

describe('buildLedgerSummary', () => {
  it('is empty without entries', () => {
    expect(buildLedgerSummary([])).toEqual({ totalCents: 0, count: 0, manualCents: 0, linkedCents: 0, categories: [] });
  });

  it('splits the total by origin and orders the categories from the heaviest, then by name', () => {
    const summary = buildLedgerSummary([
      entry({ category: 'Utenze' }),
      entry({ category: 'Palestre', amountCents: 3000, linked: true }),
      entry({ category: 'Assicurazioni' }),
      entry({ category: 'Palestre', amountCents: 500 }),
    ]);
    expect(summary).toMatchObject({ totalCents: 5500, count: 4, manualCents: 2500, linkedCents: 3000 });
    expect(summary.categories.map(({ category, totalCents, count }) => ({ category, totalCents, count }))).toEqual([
      { category: 'Palestre', totalCents: 3500, count: 2 },
      { category: 'Assicurazioni', totalCents: 1000, count: 1 },
      { category: 'Utenze', totalCents: 1000, count: 1 },
    ]);
  });

  it('gives each category its first and last day', () => {
    const [row] = buildLedgerSummary([
      entry({ occurredOn: '2031-03-09' }),
      entry({ occurredOn: '2031-03-02' }),
      entry({ occurredOn: '2031-04-20' }),
    ]).categories;
    expect(row).toMatchObject({ firstOn: '2031-03-02', lastOn: '2031-04-20' });
  });

  it('names the three biggest expenses of a category, adding up the ones with the same name and skipping the unnamed', () => {
    const [row] = buildLedgerSummary([
      entry({ description: 'Luce', amountCents: 8000 }),
      entry({ description: 'Gas', amountCents: 2000 }),
      entry({ description: 'Acqua', amountCents: 1500 }),
      entry({ description: 'Gas', amountCents: 2000 }),
      entry({ description: 'Telefono', amountCents: 500 }),
      entry({ description: null, amountCents: 9000 }),
    ]).categories;
    expect(row?.names).toEqual(['Luce', 'Gas', 'Acqua']);
    expect(row?.count).toBe(6);
  });
});

describe('GET /ledger/summary: the expenses of any period', () => {
  let ctx: TestContext;
  let admin: Actor;
  let secretary: Actor;
  let outsider: Actor;

  const call = (actor: Actor, method: 'GET' | 'POST', url: string, payload?: object) =>
    ctx.app.inject({ method, url: `${API}${url}`, headers: actor.headers, payload });
  const summary = async (query: string, actor = admin) => (await call(actor, 'GET', `/ledger/summary?${query}`)).json<SummaryDto>();
  const book = (payload: object, actor = admin) => call(actor, 'POST', '/ledger/entries', { kind: 'EXPENSE', category: 'Utenze', ...payload });

  beforeAll(async () => {
    ctx = await createTestContext();
    const societyId = (await createSociety(ctx, 'Riepilogo ASD')).id;
    admin = await createActor(ctx, societyId, 'ADMIN');
    secretary = await createActor(ctx, societyId, 'SEGRETERIA');
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altro Riepilogo ASD')).id, 'ADMIN');

    await book({ description: 'Luce', amountCents: 8000, occurredOn: '2031-03-02' });
    await book({ description: 'Gas', amountCents: 2000, occurredOn: '2031-03-09', supplier: 'Gas Nord' });
    await book({ description: 'Palloni', category: 'Attrezzatura sportiva', amountCents: 5000, occurredOn: '2031-04-01' });
    await call(admin, 'POST', '/ledger/entries', { kind: 'INCOME', category: 'Contributi', amountCents: 90_000, occurredOn: '2031-03-03' });
    expect((await call(admin, 'POST', '/venues', { name: 'Palazzetto', costCents: 30_000, costDate: '2031-03-05' })).statusCode).toBe(201);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('adds up the expenses of a week, by origin and per category', async () => {
    expect(await summary('kind=EXPENSE&from=2031-03-03&to=2031-03-09')).toEqual({
      totalCents: 32_000,
      count: 2,
      manualCents: 2000,
      linkedCents: 30_000,
      categories: [
        { category: 'Palestre', totalCents: 30_000, count: 1, firstOn: '2031-03-05', lastOn: '2031-03-05', names: ['Palazzetto'] },
        { category: 'Utenze', totalCents: 2000, count: 1, firstOn: '2031-03-09', lastOn: '2031-03-09', names: ['Gas'] },
      ],
    });
  });

  it('includes both the first and the last day, and ignores the incomes', async () => {
    const march = await summary('kind=EXPENSE&from=2031-03-01&to=2031-03-31');
    expect(march).toMatchObject({ totalCents: 40_000, count: 3, manualCents: 10_000, linkedCents: 30_000 });
    expect(march.categories.find((row) => row.category === 'Utenze')).toMatchObject({ firstOn: '2031-03-02', lastOn: '2031-03-09', names: ['Luce', 'Gas'] });
    expect((await summary('kind=EXPENSE&from=2031-03-02&to=2031-03-02')).totalCents).toBe(8000);
    expect((await summary('kind=INCOME&from=2031-03-01&to=2031-03-31')).totalCents).toBe(90_000);
  });

  it('follows the search and the origin of the list, so what is added up is what is listed', async () => {
    const search = await summary('kind=EXPENSE&q=nord');
    expect(search).toMatchObject({ totalCents: 2000, count: 1 });
    expect(search.categories.map((row) => row.category)).toEqual(['Utenze']);

    expect(await summary('kind=EXPENSE&origin=LINKED')).toMatchObject({ totalCents: 30_000, manualCents: 0, linkedCents: 30_000 });
    expect(await summary('kind=EXPENSE&origin=MANUAL')).toMatchObject({ totalCents: 15_000, count: 3, linkedCents: 0 });

    const listed = await call(admin, 'GET', '/ledger/entries?kind=EXPENSE&origin=MANUAL&limit=100');
    expect(listed.json<{ data: unknown[] }>().data).toHaveLength(3);
  });

  it("can be asked about a single category, as on the page of the category", async () => {
    const utenze = await summary("kind=EXPENSE&category=Utenze");
    expect(utenze).toMatchObject({ totalCents: 10_000, count: 2, manualCents: 10_000, linkedCents: 0 });
    expect(utenze.categories.map((row) => row.category)).toEqual(["Utenze"]);
    expect(await summary("kind=EXPENSE&category=Palestre&from=2031-04-01&to=2031-04-30")).toMatchObject({ totalCents: 0, count: 0 });
    expect(await summary("kind=EXPENSE&category=Palestre")).toMatchObject({ totalCents: 30_000, linkedCents: 30_000 });
  });

  it('counts everything when no period is given, and nothing for an empty one', async () => {
    expect((await summary('kind=EXPENSE')).count).toBe(4);
    expect(await summary('kind=EXPENSE&from=2040-01-01&to=2040-12-31')).toEqual({
      totalCents: 0,
      count: 0,
      manualCents: 0,
      linkedCents: 0,
      categories: [],
    });
  });

  it('needs the kind and valid days', async () => {
    for (const query of ['', 'kind=NOPE', 'kind=EXPENSE&from=2031-13-01', 'kind=EXPENSE&to=ieri', 'kind=EXPENSE&origin=OTHER']) {
      expect((await call(admin, 'GET', `/ledger/summary?${query}`)).statusCode, query).toBe(422);
    }
  });

  it('is for the administration only, and never shows another society', async () => {
    expect((await call(secretary, 'GET', '/ledger/summary?kind=EXPENSE')).statusCode).toBe(403);
    expect((await summary('kind=EXPENSE', outsider)).count).toBe(0);
  });
});
