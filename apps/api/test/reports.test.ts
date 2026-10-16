import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAccountingReport } from '../src/modules/reports/data.js';
import { accountingReportQuerySchema } from '../src/modules/reports/schema.js';
import { scopeToTenant } from '../src/lib/tenant.js';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, type Actor } from './helpers/factories.js';

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

describe('accounting report for the accountant (PDF)', () => {
  let ctx: TestContext;
  let societyId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;

  beforeAll(async () => {
    ctx = await createTestContext();
    const society = await ctx.prisma.society.create({
      data: { name: 'Aquile Volley ASD', slug: 'aquile-report', fiscalCode: '91234567890', city: 'Bologna', email: 'info@aquilevolley.it' },
    });
    societyId = society.id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    const other = await createSociety(ctx, 'Altra ASD');
    outsider = await createActor(ctx, other.id, 'ADMIN');
    const p = ctx.prisma;

    await p.ledgerEntry.createMany({
      data: [
        { societyId, kind: 'INCOME', category: 'Quote', description: 'Quote novembre', amountCents: 24000, occurredOn: day('2026-11-05') },
        { societyId, kind: 'INCOME', category: 'Sponsor', description: 'Ottica Rossi', amountCents: 150000, occurredOn: day('2026-09-01') },
        { societyId, kind: 'EXPENSE', category: 'Affitto palestra', description: 'Novembre', amountCents: 60000, occurredOn: day('2026-11-10') },
        { societyId, kind: 'EXPENSE', category: 'Arbitri', amountCents: 4000, occurredOn: day('2026-12-31') },
        // Outside the periods used below
        { societyId, kind: 'EXPENSE', category: 'Affitto palestra', amountCents: 99900, occurredOn: day('2025-12-31') },
        { societyId, kind: 'INCOME', category: 'Quote', amountCents: 11100, occurredOn: day('2027-01-01') },
      ],
    });
    // A society that is not ours has entries too: they must never show up.
    await p.ledgerEntry.create({ data: { societyId: outsider.societyId, kind: 'INCOME', category: 'Segreto', amountCents: 777700, occurredOn: day('2026-11-05') } });

    const sara = await createMember(ctx, societyId, { firstName: 'Sara', lastName: 'Conti' });
    const anna = await createMember(ctx, societyId, { firstName: 'Anna', lastName: 'Ferri' });
    const paid = await p.payment.create({
      data: {
        societyId, memberId: sara.id, description: 'Quota novembre', amountCents: 6000, dueDate: day('2026-11-01'),
        status: 'PAID', paidAt: new Date('2026-11-05T09:00:00.000Z'), method: 'BANK_TRANSFER',
      },
    });
    await p.receipt.create({ data: { societyId, paymentId: paid.id, number: 147 } });
    await p.payment.create({
      data: { societyId, memberId: anna.id, description: 'Quota ottobre', amountCents: 6000, dueDate: day('2026-10-01'), status: 'PENDING' },
    });
    await p.payment.create({
      // Not due yet: neither collected nor overdue
      data: { societyId, memberId: anna.id, description: 'Quota futura', amountCents: 6000, dueDate: day('2099-01-01'), status: 'PENDING' },
    });

    await p.sponsor.create({
      data: { societyId, name: 'Ottica Rossi', amountCents: 150000, contractStart: day('2026-09-01'), contractEnd: day('2027-08-31'), status: 'ACTIVE' },
    });
    await p.sponsor.create({ data: { societyId, name: 'Vecchio Sponsor', amountCents: 90000, contractStart: day('2024-09-01'), contractEnd: day('2025-08-31'), status: 'EXPIRED' } });
    await p.sponsor.create({ data: { societyId, name: 'Possibile Sponsor', amountCents: 50000, status: 'PROSPECT' } });

    await p.trip.create({ data: { societyId, destination: 'Rimini', departAt: new Date('2026-11-14T06:00:00.000Z'), costCents: 12050, status: 'CONFIRMED' } });
    await p.trip.create({ data: { societyId, destination: 'Annullata', departAt: new Date('2026-11-20T06:00:00.000Z'), costCents: 9999, status: 'CANCELLED' } });

    const season = await p.season.create({ data: { societyId, name: '2026/27', startsOn: day('2026-09-01'), endsOn: day('2027-06-30') } });
    const competition = await p.competition.create({ data: { societyId, seasonId: season.id, name: 'Serie D' } });
    const group = await p.group.create({ data: { societyId, competitionId: competition.id, name: 'Girone B' } });
    const home = await p.groupTeam.create({ data: { societyId, groupId: group.id, name: 'Aquile' } });
    const away = await p.groupTeam.create({ data: { societyId, groupId: group.id, name: 'Delfini' } });
    const match = await p.match.create({ data: { societyId, groupId: group.id, homeTeamId: home.id, awayTeamId: away.id, playedAt: new Date('2026-11-14T19:30:00.000Z') } });
    const referee = await p.referee.create({ data: { societyId, firstName: 'Luca', lastName: 'Bianchi' } });
    await p.refereeAssignment.create({ data: { societyId, refereeId: referee.id, matchId: match.id, feeCents: 4000, reimbursedAt: new Date('2026-11-20T00:00:00.000Z') } });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const query = (filters: Record<string, string> = {}) => new URLSearchParams({ from: '2026-01-01', to: '2026-12-31', ...filters }).toString();
  const data = (filters: Record<string, string> = {}) => {
    const parsed = accountingReportQuerySchema.parse({ from: '2026-01-01', to: '2026-12-31', ...filters });
    return buildAccountingReport({ db: scopeToTenant(ctx.prisma, societyId) }, parsed, new Date('2026-12-15T10:00:00.000Z'));
  };

  describe('what the report contains', () => {
    it('sums the ledger of the period only, per category, balance included', async () => {
      const { ledger } = await data();
      expect(ledger?.totals).toEqual({ incomeCents: 174000, expenseCents: 64000, balanceCents: 110000 });
      expect(ledger?.entries.map((entry) => entry.occurredOn.toISOString().slice(0, 10))).toEqual([
        '2026-09-01', '2026-11-05', '2026-11-10', '2026-12-31',
      ]);
      expect(ledger?.categories).toEqual([
        { kind: 'EXPENSE', category: 'Affitto palestra', count: 1, totalCents: 60000 },
        { kind: 'EXPENSE', category: 'Arbitri', count: 1, totalCents: 4000 },
        { kind: 'INCOME', category: 'Sponsor', count: 1, totalCents: 150000 },
        { kind: 'INCOME', category: 'Quote', count: 1, totalCents: 24000 },
      ]);
    });

    it('includes both borders of the period and nothing from another society', async () => {
      const { ledger } = await data({ from: '2026-12-31', to: '2026-12-31' });
      expect(ledger?.entries).toHaveLength(1);
      const secret = await data({ from: '2026-11-05', to: '2026-11-05' });
      expect(secret.ledger?.totals.incomeCents).toBe(24000);
    });

    it('lists what was collected, with the receipt number, and the fees overdue and not collected', async () => {
      const { fees } = await data();
      expect(fees?.collectedCents).toBe(6000);
      expect(fees?.payments).toMatchObject([
        { memberName: 'Sara Conti', description: 'Quota novembre', method: 'BANK_TRANSFER', amountCents: 6000, receiptNumber: 147 },
      ]);
      expect(fees?.overdueCents).toBe(6000);
      expect(fees?.overdue).toMatchObject([{ memberName: 'Anna Ferri', description: 'Quota ottobre', amountCents: 6000 }]);
    });

    it('takes the contracts that overlap the period, leaving out prospects and old ones', async () => {
      const { sponsors } = await data();
      expect(sponsors?.items.map((item) => item.name)).toEqual(['Ottica Rossi']);
      expect(sponsors?.totalCents).toBe(150000);
    });

    it('counts the trips that are not cancelled', async () => {
      const { trips } = await data();
      expect(trips?.items).toMatchObject([{ destination: 'Rimini', costCents: 12050, status: 'CONFIRMED' }]);
      expect(trips?.totalCostCents).toBe(12050);
    });

    it('lists the referee fees of the matches of the period, with what was reimbursed', async () => {
      const { referees } = await data();
      expect(referees?.items).toMatchObject([{ refereeName: 'Luca Bianchi', match: 'Aquile - Delfini', feeCents: 4000 }]);
      expect(referees?.totalFeeCents).toBe(4000);
      expect(referees?.reimbursedCents).toBe(4000);
      expect((await data({ from: '2026-01-01', to: '2026-11-13' })).referees?.items).toEqual([]);
    });

    it('builds only the requested sections', async () => {
      const report = await data({ sections: 'TRIPS,SPONSORS' });
      expect(Object.keys(report).sort()).toEqual(['generatedAt', 'period', 'society', 'sponsors', 'trips']);
    });
  });

  describe('the query', () => {
    it('defaults to every section and to the current year until today', () => {
      const parsed = accountingReportQuerySchema.parse({});
      expect(parsed.sections).toEqual(['LEDGER', 'FEES', 'SPONSORS', 'TRIPS', 'REFEREES']);
      expect(parsed.from).toBe(`${new Date().getUTCFullYear()}-01-01`);
      expect(parsed.to).toBe(new Date().toISOString().slice(0, 10));
    });

    it('rejects unknown sections, an inverted period and a period longer than five years', () => {
      expect(accountingReportQuerySchema.safeParse({ sections: 'LEDGER,TAXES' }).success).toBe(false);
      expect(accountingReportQuerySchema.safeParse({ from: '2026-12-31', to: '2026-01-01' }).success).toBe(false);
      expect(accountingReportQuerySchema.safeParse({ from: '2015-01-01', to: '2026-01-01' }).success).toBe(false);
      expect(accountingReportQuerySchema.safeParse({ from: '2021-01-01', to: '2026-01-01' }).success).toBe(true);
    });

    it('ignores repeated sections', () => {
      expect(accountingReportQuerySchema.parse({ sections: 'FEES,FEES' }).sections).toEqual(['FEES']);
    });
  });

  describe('the endpoints', () => {
    const pdf = (actor: Actor | null, path = `/reports/accounting.pdf?${query()}`) =>
      ctx.app.inject({ method: 'GET', url: `${API}${path}`, headers: actor?.headers });

    it('serves a PDF to the administrator, as a download', async () => {
      const response = await pdf(actors.ADMIN);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['content-disposition']).toBe('attachment; filename="report-aquile-volley-asd-2026-01-01_2026-12-31.pdf"');
      expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      expect(response.rawPayload.length).toBeGreaterThan(2000);
    });

    it('marks a partial report in the file name', async () => {
      const response = await pdf(actors.ADMIN, `/reports/accounting.pdf?${query({ sections: 'LEDGER' })}`);
      expect(response.headers['content-disposition']).toContain('-parziale.pdf');
    });

    it('is for administrators only', async () => {
      for (const role of ROLES) {
        const expected = role === 'ADMIN' ? 200 : 403;
        expect((await pdf(actors[role])).statusCode, role).toBe(expected);
        expect((await pdf(actors[role], `/reports/accounting/summary?${query()}`)).statusCode, `${role} summary`).toBe(expected);
      }
      expect((await pdf(null)).statusCode).toBe(401);
    });

    it('answers 422 to a bad query', async () => {
      expect((await pdf(actors.ADMIN, '/reports/accounting.pdf?from=ieri')).statusCode).toBe(422);
      expect((await pdf(actors.ADMIN, `/reports/accounting.pdf?${query({ sections: 'TASSE' })}`)).statusCode).toBe(422);
      expect((await pdf(actors.ADMIN, `/reports/accounting.pdf?${query({ from: '2027-01-01', to: '2026-01-01' })}`)).statusCode).toBe(422);
    });

    it('summarises each section for the screen that chooses what to export', async () => {
      const response = await pdf(actors.ADMIN, `/reports/accounting/summary?${query()}`);
      expect(response.json()).toEqual({
        period: { from: '2026-01-01', to: '2026-12-31' },
        sections: [
          { section: 'LEDGER', records: 4, amountCents: 110000 },
          { section: 'FEES', records: 2, amountCents: 6000 },
          { section: 'SPONSORS', records: 1, amountCents: 150000 },
          { section: 'TRIPS', records: 1, amountCents: 12050 },
          { section: 'REFEREES', records: 1, amountCents: 4000 },
        ],
      });
    });

    it('never reports another society, and works with no data at all', async () => {
      const empty = await pdf(outsider, `/reports/accounting/summary?${query({ from: '2020-01-01', to: '2020-12-31' })}`);
      expect(empty.json().sections.every((section: { records: number; amountCents: number }) => section.records === 0 && section.amountCents === 0)).toBe(true);
      const response = await pdf(outsider, `/reports/accounting.pdf?${query({ from: '2020-01-01', to: '2020-12-31' })}`);
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('paginates a long ledger without failing', async () => {
      const society = await createSociety(ctx, 'Tanti Movimenti ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      await ctx.prisma.ledgerEntry.createMany({
        data: Array.from({ length: 220 }, (_, index) => ({
          societyId: society.id,
          kind: index % 3 === 0 ? 'EXPENSE' : 'INCOME',
          category: `Categoria ${index % 7}`,
          description: 'Una descrizione abbastanza lunga da occupare più di una riga nella colonna dedicata alla descrizione del movimento',
          amountCents: 1000 + index,
          occurredOn: day('2026-06-15'),
        })),
      });
      const response = await ctx.app.inject({ method: 'GET', url: `${API}/reports/accounting.pdf?${query({ sections: 'LEDGER' })}`, headers: owner.headers });
      expect(response.statusCode).toBe(200);
      const text = response.rawPayload.toString('latin1');
      const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
      expect(pages).toBeGreaterThan(3);
    });
  });
});
