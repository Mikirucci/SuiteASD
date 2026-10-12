import { describe, expect, it } from 'vitest';
import { buildLedgerReport } from '../src/modules/ledger/report.js';
import { API } from './helpers/app.js';
import { describeCrudModule } from './helpers/crud-suite.js';

describe('buildLedgerReport', () => {
  it('returns twelve empty months for a year without entries', () => {
    const report = buildLedgerReport(2026, []);
    expect(report.months).toHaveLength(12);
    expect(report.months[0]).toEqual({ month: '2026-01', incomeCents: 0, expenseCents: 0, balanceCents: 0 });
    expect(report.months[11]?.month).toBe('2026-12');
    expect(report.totals).toEqual({ incomeCents: 0, expenseCents: 0, balanceCents: 0 });
    expect(report.categories).toEqual([]);
  });

  it('sums by month and category and signs the balance by kind', () => {
    const report = buildLedgerReport(2026, [
      { kind: 'INCOME', category: 'Quote', amountCents: 6000, occurredOn: new Date('2026-11-05T00:00:00Z') },
      { kind: 'INCOME', category: 'Quote', amountCents: 4000, occurredOn: new Date('2026-11-20T00:00:00Z') },
      { kind: 'INCOME', category: 'Sponsor', amountCents: 20000, occurredOn: new Date('2026-01-31T00:00:00Z') },
      { kind: 'EXPENSE', category: 'Palestra', amountCents: 7500, occurredOn: new Date('2026-11-30T00:00:00Z') },
    ]);
    expect(report.totals).toEqual({ incomeCents: 30000, expenseCents: 7500, balanceCents: 22500 });
    expect(report.months[10]).toEqual({ month: '2026-11', incomeCents: 10000, expenseCents: 7500, balanceCents: 2500 });
    expect(report.months[0]).toMatchObject({ month: '2026-01', incomeCents: 20000, balanceCents: 20000 });
    expect(report.categories).toEqual([
      { kind: 'EXPENSE', category: 'Palestra', totalCents: 7500 },
      { kind: 'INCOME', category: 'Sponsor', totalCents: 20000 },
      { kind: 'INCOME', category: 'Quote', totalCents: 10000 },
    ]);
  });
});

describeCrudModule(
  {
    title: 'ledger entries',
    path: '/ledger/entries',
    readRoles: ['ADMIN'],
    writeRoles: ['ADMIN'],
    createPayload: ({ n }) => ({
      kind: 'EXPENSE',
      category: 'Affitto palestra',
      description: `Novembre ${n}`,
      amountCents: 45_000,
      occurredOn: '2026-11-03',
    }),
    invalidPayload: { kind: 'GIFT', category: '', amountCents: 0, occurredOn: '03/11/2026' },
    invalidFields: ['kind', 'category', 'amountCents', 'occurredOn'],
    patch: {
      payload: { kind: 'INCOME', amountCents: 50_000, description: null },
      expected: { kind: 'INCOME', amountCents: 50_000, description: null, category: 'Affitto palestra', occurredOn: '2026-11-03' },
    },
  },
  (get) => {
    describe('ledger rules', () => {
      it('filters by kind, category and date range, newest first', async () => {
        const { ctx, actors, societyId } = get();
        await ctx.prisma.ledgerEntry.createMany({
          data: [
            { societyId, kind: 'INCOME', category: 'Filtro', amountCents: 100, occurredOn: new Date('2028-02-10') },
            { societyId, kind: 'EXPENSE', category: 'Filtro', amountCents: 200, occurredOn: new Date('2028-03-10') },
            { societyId, kind: 'EXPENSE', category: 'Altro', amountCents: 300, occurredOn: new Date('2028-04-10') },
          ],
        });
        const amounts = async (query: string) => {
          const response = await ctx.app.inject({ method: 'GET', url: `${API}/ledger/entries?${query}`, headers: actors.ADMIN.headers });
          return response.json<{ data: { amountCents: number }[] }>().data.map((entry) => entry.amountCents);
        };
        expect(await amounts('category=Filtro')).toEqual([200, 100]);
        expect(await amounts('kind=EXPENSE&from=2028-01-01&to=2028-03-31')).toEqual([200]);
        expect(await amounts('from=2028-03-10&to=2028-04-10')).toEqual([300, 200]);
      });

      it('links an entry to a sponsor of the same society only', async () => {
        const { ctx, actors, societyId, outsider } = get();
        const sponsor = await ctx.prisma.sponsor.create({ data: { societyId, name: 'Pizzeria Da Gigi' } });
        const payload = { kind: 'INCOME', category: 'Sponsor', amountCents: 100_000, occurredOn: '2026-10-01', sponsorId: sponsor.id };
        const own = await ctx.app.inject({ method: 'POST', url: `${API}/ledger/entries`, headers: actors.ADMIN.headers, payload });
        expect(own.statusCode).toBe(201);
        expect(own.json()).toMatchObject({ sponsorId: sponsor.id, paymentId: null });
        const foreign = await ctx.app.inject({ method: 'POST', url: `${API}/ledger/entries`, headers: outsider.headers, payload });
        expect(foreign.statusCode).toBe(404);
        const stored = await ctx.prisma.ledgerEntry.findUniqueOrThrow({ where: { id: own.json().id } });
        expect(stored.createdById).toBe(actors.ADMIN.user.id);
      });
    });

    describe('GET /ledger/report', () => {
      it('aggregates one year of the caller society only and defaults to the current year', async () => {
        const { ctx, actors, societyId, outsider } = get();
        await ctx.prisma.ledgerEntry.createMany({
          data: [
            { societyId, kind: 'INCOME', category: 'Quote', amountCents: 6000, occurredOn: new Date('2031-11-05') },
            { societyId, kind: 'EXPENSE', category: 'Palestra', amountCents: 2500, occurredOn: new Date('2031-11-30') },
            { societyId, kind: 'INCOME', category: 'Quote', amountCents: 999, occurredOn: new Date('2032-01-01') },
            { societyId: outsider.societyId, kind: 'INCOME', category: 'Quote', amountCents: 77_777, occurredOn: new Date('2031-11-05') },
            { societyId, kind: 'INCOME', category: 'Oggi', amountCents: 1, occurredOn: new Date() },
          ],
        });
        const report = await ctx.app.inject({ method: 'GET', url: `${API}/ledger/report?year=2031`, headers: actors.ADMIN.headers });
        expect(report.statusCode).toBe(200);
        const body = report.json();
        expect(body.year).toBe(2031);
        expect(body.totals).toEqual({ incomeCents: 6000, expenseCents: 2500, balanceCents: 3500 });
        expect(body.months).toHaveLength(12);
        expect(body.months[10]).toEqual({ month: '2031-11', incomeCents: 6000, expenseCents: 2500, balanceCents: 3500 });
        expect(body.categories).toEqual([
          { kind: 'EXPENSE', category: 'Palestra', totalCents: 2500 },
          { kind: 'INCOME', category: 'Quote', totalCents: 6000 },
        ]);

        const current = await ctx.app.inject({ method: 'GET', url: `${API}/ledger/report`, headers: actors.ADMIN.headers });
        expect(current.json().year).toBe(new Date().getUTCFullYear());
        expect(current.json().categories).toContainEqual({ kind: 'INCOME', category: 'Oggi', totalCents: 1 });
      });

      it('is admin only and validates the year', async () => {
        const { ctx, actors } = get();
        for (const role of ['SEGRETERIA', 'ALLENATORE', 'STAFF', 'ATLETA', 'GENITORE'] as const) {
          const response = await ctx.app.inject({ method: 'GET', url: `${API}/ledger/report`, headers: actors[role].headers });
          expect(response.statusCode, role).toBe(403);
        }
        const invalid = await ctx.app.inject({ method: 'GET', url: `${API}/ledger/report?year=1800`, headers: actors.ADMIN.headers });
        expect(invalid.statusCode).toBe(422);
      });
    });
  },
);
