import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

const dayOffset = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('fees module (quote e pagamenti)', () => {
  let ctx: TestContext;
  let societyId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;
  let teamId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Quote ASD')).id;
    const otherSocietyId = (await createSociety(ctx, 'Altra ASD')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
    teamId = (await createTeam(ctx, societyId, 'Serie D')).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const call = (actor: Actor | null, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, headers = {}) =>
    ctx.app.inject({ method, url: `${API}${url}`, headers: { ...actor?.headers, ...headers }, payload });

  async function newMember(overrides: Parameters<typeof createMember>[2] = {}, inTeam = true) {
    const member = await createMember(ctx, societyId, {
      firstName: 'Atleta',
      lastName: randomUUID().slice(0, 6),
      ...overrides,
    });
    if (inTeam) await ctx.prisma.teamMembership.create({ data: { societyId, teamId, memberId: member.id } });
    return member;
  }

  async function newFee(memberId: string, dueDate = dayOffset(10), amountCents = 6000) {
    const response = await call(actors.SEGRETERIA, 'POST', '/fees', { memberId, description: 'Quota novembre', amountCents, dueDate });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string; status: string }>();
  }

  const pay = (actor: Actor, feeId: string, payload: object = { method: 'CASH' }, key: string = randomUUID()) =>
    call(actor, 'POST', `/fees/${feeId}/pay`, payload, { 'idempotency-key': key });

  describe('authentication and role matrix', () => {
    it('answers 401 without a token', async () => {
      expect((await call(null, 'GET', '/fees')).statusCode).toBe(401);
      expect((await call(null, 'POST', '/fees/x/pay', { method: 'CASH' })).statusCode).toBe(401);
    });

    it.each([
      ['ADMIN', 200],
      ['SEGRETERIA', 200],
      ['ALLENATORE', 403],
      ['STAFF', 403],
      ['ATLETA', 403],
      ['GENITORE', 403],
    ] as const)('%s reading the summary gets %i', async (role, expected) => {
      expect((await call(actors[role], 'GET', '/fees/summary')).statusCode).toBe(expected);
    });

    it.each([
      ['ADMIN', 201],
      ['SEGRETERIA', 201],
      ['ALLENATORE', 403],
      ['STAFF', 403],
      ['ATLETA', 403],
      ['GENITORE', 403],
    ] as const)('%s creating a fee plan gets %i', async (role, expected) => {
      expect((await call(actors[role], 'POST', '/fee-plans', { name: `Piano ${role}`, amountCents: 6000 })).statusCode).toBe(expected);
    });

    it.each(['ALLENATORE', 'STAFF', 'ATLETA', 'GENITORE'] as const)('%s cannot register a payment', async (role) => {
      const member = await newMember();
      const fee = await newFee(member.id);
      expect((await pay(actors[role], fee.id)).statusCode).toBe(403);
      expect(await ctx.prisma.payment.findUniqueOrThrow({ where: { id: fee.id } })).toMatchObject({ status: 'PENDING' });
    });
  });

  describe('fee plans', () => {
    it('creates, updates and deletes a plan, validating the amount', async () => {
      const created = await call(actors.ADMIN, 'POST', '/fee-plans', { name: 'Quota novembre', amountCents: 6000, teamId });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ kind: 'MONTHLY', amountCents: 6000, currency: 'EUR', teamId, isActive: true });
      const id = created.json().id;
      const updated = await call(actors.SEGRETERIA, 'PATCH', `/fee-plans/${id}`, { amountCents: 6500, dueDay: 10 });
      expect(updated.json()).toMatchObject({ amountCents: 6500, dueDay: 10 });
      expect((await call(actors.ADMIN, 'POST', '/fee-plans', { name: 'Bad', amountCents: 0 })).statusCode).toBe(422);
      expect((await call(actors.ADMIN, 'POST', '/fee-plans', { name: 'Bad', amountCents: 10.5 })).statusCode).toBe(422);
      expect((await call(actors.ADMIN, 'DELETE', `/fee-plans/${id}`)).statusCode).toBe(204);
    });

    it('refuses a team of another society and a plan that already has fees to delete', async () => {
      const foreignTeam = await ctx.prisma.team.create({ data: { societyId: outsider.societyId, name: 'Foreign' } });
      expect((await call(actors.ADMIN, 'POST', '/fee-plans', { name: 'X', amountCents: 100, teamId: foreignTeam.id })).statusCode).toBe(404);

      const plan = await call(actors.ADMIN, 'POST', '/fee-plans', { name: 'Con quote', amountCents: 5000 });
      const member = await newMember();
      await call(actors.ADMIN, 'POST', `/fee-plans/${plan.json().id}/generate`, { dueDate: dayOffset(5), memberIds: [member.id] });
      const removed = await call(actors.ADMIN, 'DELETE', `/fee-plans/${plan.json().id}`);
      expect(removed.statusCode).toBe(409);
      expect(removed.json()).toMatchObject({ code: 'fee_plan_in_use' });
    });
  });

  describe('fee generation', () => {
    it('creates one fee per active team member and is idempotent', async () => {
      const team = await createTeam(ctx, societyId, 'Generazione');
      const active = [await createMember(ctx, societyId, { firstName: 'A1' }), await createMember(ctx, societyId, { firstName: 'A2' })];
      for (const member of active) await ctx.prisma.teamMembership.create({ data: { societyId, teamId: team.id, memberId: member.id } });
      const left = await createMember(ctx, societyId, { firstName: 'Left' });
      await ctx.prisma.teamMembership.create({ data: { societyId, teamId: team.id, memberId: left.id, leftAt: new Date() } });
      const inactive = await createMember(ctx, societyId, { firstName: 'Inactive', status: 'INACTIVE' });
      await ctx.prisma.teamMembership.create({ data: { societyId, teamId: team.id, memberId: inactive.id } });

      const plan = await call(actors.SEGRETERIA, 'POST', '/fee-plans', { name: 'Quota novembre', amountCents: 6000, teamId: team.id });
      const planId = plan.json().id;
      const first = await call(actors.SEGRETERIA, 'POST', `/fee-plans/${planId}/generate`, { dueDate: '2026-11-10' });
      expect(first.json()).toEqual({ created: 2, skipped: 0 });
      const again = await call(actors.SEGRETERIA, 'POST', `/fee-plans/${planId}/generate`, { dueDate: '2026-11-10' });
      expect(again.json()).toEqual({ created: 0, skipped: 2 });
      const december = await call(actors.SEGRETERIA, 'POST', `/fee-plans/${planId}/generate`, { dueDate: '2026-12-10' });
      expect(december.json()).toEqual({ created: 2, skipped: 0 });

      const fees = await ctx.prisma.payment.findMany({ where: { feePlanId: planId, dueDate: new Date('2026-11-10T00:00:00Z') } });
      expect(fees.map((fee) => [fee.amountCents, fee.description, fee.status])).toEqual([
        [6000, 'Quota novembre', 'PENDING'],
        [6000, 'Quota novembre', 'PENDING'],
      ]);
    });

    it('targets every active member when the plan has no team and rejects members outside the target', async () => {
      const lone = await createSociety(ctx, 'Solo ASD');
      const admin = await createActor(ctx, lone.id, 'ADMIN');
      const m1 = await createMember(ctx, lone.id, { firstName: 'M1' });
      await createMember(ctx, lone.id, { firstName: 'M2', fiscalCode: 'AAAAAA00A00A000A' });
      const plan = await ctx.app.inject({ method: 'POST', url: `${API}/fee-plans`, headers: admin.headers, payload: { name: 'Iscrizione', kind: 'ENROLLMENT', amountCents: 15000 } });
      const generate = (payload: object) =>
        ctx.app.inject({ method: 'POST', url: `${API}/fee-plans/${plan.json().id}/generate`, headers: admin.headers, payload });
      expect((await generate({ dueDate: '2026-09-30' })).json()).toEqual({ created: 2, skipped: 0 });
      const foreign = await createMember(ctx, societyId, { firstName: 'Foreign' });
      const bad = await generate({ dueDate: '2026-10-30', memberIds: [m1.id, foreign.id] });
      expect(bad.statusCode).toBe(422);
      expect(bad.json()).toMatchObject({ code: 'members_not_in_plan_target' });
      expect((await generate({ dueDate: 'not-a-date' })).statusCode).toBe(422);
    });

    it('does not generate from an inactive plan', async () => {
      const plan = await call(actors.ADMIN, 'POST', '/fee-plans', { name: 'Chiuso', amountCents: 100, isActive: false });
      const response = await call(actors.ADMIN, 'POST', `/fee-plans/${plan.json().id}/generate`, { dueDate: dayOffset(3) });
      expect(response.statusCode).toBe(409);
    });
  });

  describe('listing and summary', () => {
    it('derives Pagato / In attesa / Scaduto from payment status and due date, with totals', async () => {
      const society = await createSociety(ctx, 'Stati ASD');
      const admin = await createActor(ctx, society.id, 'SEGRETERIA');
      const make = async (name: string, dueDate: string, extra: object = {}) => {
        const member = await createMember(ctx, society.id, { firstName: name, fiscalCode: `${name}0000000000000`.slice(0, 16) });
        return ctx.prisma.payment.create({
          data: { societyId: society.id, memberId: member.id, description: 'Quota', amountCents: 6000, dueDate: new Date(`${dueDate}T00:00:00Z`), ...extra },
        });
      };
      await make('Paid', dayOffset(-20), { status: 'PAID', paidAt: new Date(), method: 'CASH' });
      await make('Pending', dayOffset(5), { reminderCount: 2 });
      await make('Today', dayOffset(0));
      await make('Overdue', dayOffset(-3), { reminderCount: 1 });

      const get = (query: string) => ctx.app.inject({ method: 'GET', url: `${API}/fees${query}`, headers: admin.headers });
      const statuses = (await get('')).json().data.map((fee: { memberName: string; status: string }) => [fee.memberName.split(' ')[0], fee.status]);
      expect(Object.fromEntries(statuses)).toEqual({ Paid: 'PAID', Pending: 'PENDING', Today: 'PENDING', Overdue: 'OVERDUE' });
      expect((await get('?status=OVERDUE')).json().data).toHaveLength(1);
      expect((await get('?status=PENDING')).json().data).toHaveLength(2);
      expect((await get('?status=PAID')).json().data).toHaveLength(1);
      expect((await get('?q=Overd')).json().data).toHaveLength(1);

      const summary = await ctx.app.inject({ method: 'GET', url: `${API}/fees/summary`, headers: admin.headers });
      expect(summary.json()).toEqual({
        incassatoCents: 6000,
        daIncassareCents: 18000,
        scadutoCents: 6000,
        promemoriaInviati: 3,
        paidCount: 1,
        pendingCount: 2,
        overdueCount: 1,
      });
    });

    it('paginates without gaps or duplicates and filters by team and plan', async () => {
      const society = await createSociety(ctx, 'Pagine ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const team = await createTeam(ctx, society.id, 'Squadra');
      const plan = await ctx.prisma.feePlan.create({ data: { societyId: society.id, name: 'Piano', amountCents: 1000, teamId: team.id } });
      for (let i = 0; i < 5; i += 1) {
        const member = await createMember(ctx, society.id, { firstName: `P${i}`, fiscalCode: `PAGINA${i}0000000000`.slice(0, 16) });
        await ctx.prisma.teamMembership.create({ data: { societyId: society.id, teamId: team.id, memberId: member.id } });
        await ctx.prisma.payment.create({
          data: { societyId: society.id, memberId: member.id, feePlanId: plan.id, description: 'Quota', amountCents: 1000, dueDate: new Date(`2026-11-0${i + 1}T00:00:00Z`) },
        });
      }
      await ctx.prisma.payment.create({
        data: { societyId: society.id, memberId: (await createMember(ctx, society.id, { fiscalCode: 'ZZZZZZ00Z00Z000Z' })).id, description: 'Fuori squadra', amountCents: 1, dueDate: new Date('2026-11-09T00:00:00Z') },
      });

      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const response = await ctx.app.inject({
          method: 'GET',
          url: `${API}/fees?limit=2&teamId=${team.id}${cursor ? `&cursor=${cursor}` : ''}`,
          headers: admin.headers,
        });
        const body: { data: { id: string; dueDate: string }[]; page: { nextCursor: string | null } } = response.json();
        ids.push(...body.data.map((fee) => fee.id));
        cursor = body.page.nextCursor;
      } while (cursor);
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
      const byPlan = await ctx.app.inject({ method: 'GET', url: `${API}/fees?feePlanId=${plan.id}&dueFrom=2026-11-02&dueTo=2026-11-04`, headers: admin.headers });
      expect(byPlan.json().data.map((fee: { dueDate: string }) => fee.dueDate)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    });
  });

  describe('payment registration', () => {
    it('requires an Idempotency-Key', async () => {
      const fee = await newFee((await newMember()).id);
      const response = await call(actors.SEGRETERIA, 'POST', `/fees/${fee.id}/pay`, { method: 'CASH' });
      expect(response.statusCode).toBe(422);
      expect(response.json().errors.map((error: { path: string }) => error.path)).toContain('idempotency-key');
      expect((await call(actors.SEGRETERIA, 'POST', `/fees/${fee.id}/pay`, { method: 'CASH' }, { 'idempotency-key': 'short' })).statusCode).toBe(422);
    });

    it('marks the fee paid and issues receipt n. 1, then 2, per society', async () => {
      const society = await createSociety(ctx, 'Ricevute ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const feeFor = async (name: string) => {
        const member = await createMember(ctx, society.id, { firstName: name, fiscalCode: `${name}0000000000000`.slice(0, 16) });
        return ctx.prisma.payment.create({ data: { societyId: society.id, memberId: member.id, description: 'Quota', amountCents: 6000, dueDate: new Date('2026-11-10T00:00:00Z') } });
      };
      const send = async (feeId: string) =>
        ctx.app.inject({ method: 'POST', url: `${API}/fees/${feeId}/pay`, headers: { ...admin.headers, 'idempotency-key': randomUUID() }, payload: { method: 'BANK_TRANSFER', reference: 'CRO 123' } });

      const first = await send((await feeFor('One')).id);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({
        status: 'PAID',
        method: 'BANK_TRANSFER',
        reference: 'CRO 123',
        receipt: { number: 1, code: '0001' },
      });
      const firstBody = first.json<{ payerName: string; memberName: string }>();
      expect(firstBody.payerName).toBe(`One ${firstBody.memberName.split(' ')[1] ?? ''}`);
      const second = await send((await feeFor('Two')).id);
      expect(second.json().receipt).toMatchObject({ number: 2, code: '0002' });
      // Another society starts from its own sequence.
      const other = await createActor(ctx, societyId, 'SEGRETERIA');
      const otherFee = await newFee((await newMember()).id);
      expect((await pay(other, otherFee.id)).json().receipt.number).toBe(1);
    });

    it('replays the first response for the same key and creates a single receipt', async () => {
      const fee = await newFee((await newMember()).id);
      const key = randomUUID();
      const first = await pay(actors.SEGRETERIA, fee.id, { method: 'CARD' }, key);
      const retry = await pay(actors.SEGRETERIA, fee.id, { method: 'CARD' }, key);
      expect(first.statusCode).toBe(200);
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toEqual(first.json());
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(await ctx.prisma.receipt.count({ where: { paymentId: fee.id } })).toBe(1);
    });

    it('rejects the same key with another body or another fee, and a second payment with a new key', async () => {
      const fee = await newFee((await newMember()).id);
      const other = await newFee((await newMember()).id);
      const key = randomUUID();
      expect((await pay(actors.SEGRETERIA, fee.id, { method: 'CASH' }, key)).statusCode).toBe(200);
      const changedBody = await pay(actors.SEGRETERIA, fee.id, { method: 'CARD' }, key);
      expect(changedBody.statusCode).toBe(422);
      expect(changedBody.json()).toMatchObject({ code: 'idempotency_key_reused' });
      expect((await pay(actors.SEGRETERIA, other.id, { method: 'CASH' }, key)).statusCode).toBe(422);
      const doublePay = await pay(actors.SEGRETERIA, fee.id, { method: 'CASH' });
      expect(doublePay.statusCode).toBe(409);
      expect(doublePay.json()).toMatchObject({ code: 'fee_already_paid' });
      expect(await ctx.prisma.receipt.count({ where: { paymentId: fee.id } })).toBe(1);
    });

    it('does not store failed attempts: the key can be retried after a validation-level conflict', async () => {
      const fee = await newFee((await newMember()).id);
      const key = randomUUID();
      const future = new Date(Date.now() + 86_400_000).toISOString();
      expect((await pay(actors.SEGRETERIA, fee.id, { method: 'CASH', paidAt: future }, key)).statusCode).toBe(422);
      expect((await pay(actors.SEGRETERIA, fee.id, { method: 'CASH' }, key)).statusCode).toBe(200);
    });

    it('issues unique, gap-free receipt numbers under concurrency', async () => {
      const society = await createSociety(ctx, 'Concorrenza ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const fees = [];
      for (let i = 0; i < 8; i += 1) {
        const member = await createMember(ctx, society.id, { firstName: `C${i}`, fiscalCode: `CONC${i}00000000000`.slice(0, 16) });
        fees.push(await ctx.prisma.payment.create({ data: { societyId: society.id, memberId: member.id, description: 'Q', amountCents: 100, dueDate: new Date('2026-11-10T00:00:00Z') } }));
      }
      const responses = await Promise.all(
        fees.map((fee) =>
          ctx.app.inject({ method: 'POST', url: `${API}/fees/${fee.id}/pay`, headers: { ...admin.headers, 'idempotency-key': randomUUID() }, payload: { method: 'CASH' } }),
        ),
      );
      expect(responses.map((response) => response.statusCode)).toEqual(Array(8).fill(200));
      const numbers = (await ctx.prisma.receipt.findMany({ where: { societyId: society.id }, select: { number: true } })).map((r) => r.number).sort((a, b) => a - b);
      expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('applies a payment once when the same request is sent concurrently with one key', async () => {
      const fee = await newFee((await newMember()).id);
      const key = randomUUID();
      const responses = await Promise.all(Array.from({ length: 5 }, () => pay(actors.SEGRETERIA, fee.id, { method: 'CASH' }, key)));
      expect(responses.map((response) => response.statusCode)).toEqual(Array(5).fill(200));
      expect(new Set(responses.map((response) => response.body)).size).toBe(1);
      expect(await ctx.prisma.receipt.count({ where: { paymentId: fee.id } })).toBe(1);
    });

    it('applies a payment once when two different keys race on the same fee', async () => {
      const fee = await newFee((await newMember()).id);
      const responses = await Promise.all([pay(actors.SEGRETERIA, fee.id), pay(actors.SEGRETERIA, fee.id)]);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      expect(await ctx.prisma.receipt.count({ where: { paymentId: fee.id } })).toBe(1);
    });
  });

  describe('receipts and own-data access', () => {
    it('serves the receipt as a PDF to staff and to the owner only', async () => {
      const athleteActor = await createActor(ctx, societyId, 'ATLETA');
      const member = await newMember({ userId: athleteActor.user.id });
      const stranger = await createActor(ctx, societyId, 'ATLETA');
      await newMember({ userId: stranger.user.id });
      const fee = await newFee(member.id);

      expect((await call(actors.ADMIN, 'GET', `/fees/${fee.id}/receipt`)).statusCode).toBe(404);
      await pay(actors.SEGRETERIA, fee.id, { method: 'CASH' });

      const staff = await call(actors.SEGRETERIA, 'GET', `/fees/${fee.id}/receipt`);
      expect(staff.statusCode).toBe(200);
      expect(staff.headers['content-type']).toBe('application/pdf');
      expect(staff.headers['content-disposition']).toMatch(/attachment; filename="ricevuta-\d{4}\.pdf"/);
      expect(staff.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      expect(staff.rawPayload.length).toBeGreaterThan(1000);

      expect((await call(athleteActor, 'GET', `/fees/${fee.id}/receipt`)).statusCode).toBe(200);
      expect((await call(stranger, 'GET', `/fees/${fee.id}/receipt`)).statusCode).toBe(404);
      expect((await call(actors.ALLENATORE, 'GET', `/fees/${fee.id}/receipt`)).statusCode).toBe(404);
      expect((await call(outsider, 'GET', `/fees/${fee.id}/receipt`)).statusCode).toBe(404);
    });

    it('lets an athlete and a guardian see only their own / their children fees', async () => {
      const athleteActor = await createActor(ctx, societyId, 'ATLETA');
      const guardianActor = await createActor(ctx, societyId, 'GENITORE');
      const own = await newMember({ userId: athleteActor.user.id });
      const child = await newMember();
      await ctx.prisma.guardianLink.create({ data: { societyId, guardianUserId: guardianActor.user.id, memberId: child.id } });
      const otherMember = await newMember();
      const ownFee = await newFee(own.id);
      const childFee = await newFee(child.id);
      const otherFee = await newFee(otherMember.id);

      const athleteList = await call(athleteActor, 'GET', '/fees?limit=100');
      expect(athleteList.json().data.map((fee: { id: string }) => fee.id)).toEqual([ownFee.id]);
      const guardianList = await call(guardianActor, 'GET', '/fees?limit=100');
      expect(guardianList.json().data.map((fee: { id: string }) => fee.id)).toEqual([childFee.id]);
      expect((await call(athleteActor, 'GET', `/fees/${otherFee.id}`)).statusCode).toBe(404);
      expect((await call(guardianActor, 'GET', `/fees/${childFee.id}`)).statusCode).toBe(200);
      expect((await call(athleteActor, 'GET', `/fees?memberId=${otherMember.id}`)).json().data).toEqual([]);
    });
  });

  describe('tenant isolation', () => {
    it('hides fees, plans and receipts of other societies and refuses cross-tenant references', async () => {
      const member = await newMember();
      const fee = await newFee(member.id);
      const plan = await call(actors.ADMIN, 'POST', '/fee-plans', { name: 'Privato', amountCents: 100 });
      expect((await call(outsider, 'GET', `/fees/${fee.id}`)).statusCode).toBe(404);
      expect((await pay(outsider, fee.id)).statusCode).toBe(404);
      expect((await call(outsider, 'GET', `/fee-plans/${plan.json().id}`)).statusCode).toBe(404);
      expect((await call(outsider, 'POST', `/fee-plans/${plan.json().id}/generate`, { dueDate: dayOffset(1) })).statusCode).toBe(404);
      expect((await call(outsider, 'POST', '/fees', { memberId: member.id, description: 'X', amountCents: 100, dueDate: dayOffset(1) })).statusCode).toBe(404);
      const list = await call(outsider, 'GET', '/fees?limit=100');
      expect(list.json().data).toEqual([]);
      expect((await call(outsider, 'GET', '/fees/summary')).json()).toMatchObject({ incassatoCents: 0, daIncassareCents: 0 });
      expect(await ctx.prisma.payment.findUniqueOrThrow({ where: { id: fee.id } })).toMatchObject({ status: 'PENDING' });
    });

    it('scopes the idempotency key to the society', async () => {
      const key = randomUUID();
      const fee = await newFee((await newMember()).id);
      const foreignMember = await createMember(ctx, outsider.societyId, { firstName: 'Estero' });
      const foreignFee = await ctx.prisma.payment.create({
        data: { societyId: outsider.societyId, memberId: foreignMember.id, description: 'Q', amountCents: 100, dueDate: new Date('2026-12-01T00:00:00Z') },
      });
      expect((await pay(actors.SEGRETERIA, fee.id, { method: 'CASH' }, key)).statusCode).toBe(200);
      expect((await pay(outsider, foreignFee.id, { method: 'CASH' }, key)).statusCode).toBe(200);
    });
  });
});
