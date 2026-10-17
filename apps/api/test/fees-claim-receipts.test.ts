import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, type Actor } from './helpers/factories.js';

describe('payment claims ("Ho pagato") and receipt notifications', () => {
  let ctx: TestContext;
  let societyId: string;
  let owner: Actor;
  let desk: Actor;
  let coach: Actor;
  let athlete: Actor;
  let guardian: Actor;
  let stranger: Actor;
  let outsider: Actor;
  let athleteMemberId: string;
  let childId: string;
  let strangerMemberId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Segnalazioni ASD')).id;
    const otherSocietyId = (await createSociety(ctx, 'Altra ASD')).id;
    owner = await createActor(ctx, societyId, 'ADMIN');
    desk = await createActor(ctx, societyId, 'SEGRETERIA');
    coach = await createActor(ctx, societyId, 'ALLENATORE');
    athlete = await createActor(ctx, societyId, 'ATLETA');
    guardian = await createActor(ctx, societyId, 'GENITORE');
    stranger = await createActor(ctx, societyId, 'ATLETA');
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
    athleteMemberId = (await createMember(ctx, societyId, { firstName: 'Giulia', lastName: 'Rossi', userId: athlete.user.id })).id;
    childId = (await createMember(ctx, societyId, { firstName: 'Sara', lastName: 'Conti' })).id;
    await ctx.prisma.guardianLink.create({ data: { societyId, guardianUserId: guardian.user.id, memberId: childId } });
    strangerMemberId = (await createMember(ctx, societyId, { firstName: 'Marco', lastName: 'Bianchi', userId: stranger.user.id })).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const call = (actor: Actor | null, method: 'GET' | 'POST', url: string, payload?: object, headers = {}) =>
    ctx.app.inject({ method, url: `${API}${url}`, headers: { ...actor?.headers, ...headers }, payload });
  const claim = (actor: Actor | null, feeId: string) => call(actor, 'POST', `/fees/${feeId}/claim-payment`);
  const pay = (actor: Actor, feeId: string, key: string = randomUUID()) =>
    call(actor, 'POST', `/fees/${feeId}/pay`, { method: 'BANK_TRANSFER' }, { 'idempotency-key': key });
  const newFee = (memberId: string, overrides: { status?: string; description?: string; amountCents?: number } = {}) =>
    ctx.prisma.payment.create({
      data: {
        societyId,
        memberId,
        description: overrides.description ?? 'Quota novembre',
        amountCents: overrides.amountCents ?? 6000,
        dueDate: new Date('2026-11-10T00:00:00Z'),
        ...(overrides.status ? { status: overrides.status } : {}),
      },
    });
  const notificationsOf = (userId: string, type: string) =>
    ctx.prisma.notification.findMany({ where: { userId, type }, orderBy: [{ channel: 'asc' }] });

  describe('claiming a payment', () => {
    it('lets an athlete claim their own fee, sets claimedAt and leaves the status alone', async () => {
      const fee = await newFee(athleteMemberId);
      const response = await claim(athlete, fee.id);
      expect(response.statusCode).toBe(200);
      const body = response.json<{ status: string; claimedAt: string | null; paidAt: string | null }>();
      expect(body.status).toBe('PENDING');
      expect(body.paidAt).toBeNull();
      expect(body.claimedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: fee.id } })).claimedAt).not.toBeNull();
      expect((await call(athlete, 'GET', `/fees/${fee.id}`)).json().claimedAt).toBe(body.claimedAt);
    });

    it('exposes claimedAt as null on a fee nobody claimed', async () => {
      const fee = await newFee(athleteMemberId);
      expect((await call(desk, 'GET', `/fees/${fee.id}`)).json().claimedAt).toBeNull();
    });

    it('lets a guardian claim the fee of their child', async () => {
      const fee = await newFee(childId);
      const response = await claim(guardian, fee.id);
      expect(response.statusCode).toBe(200);
      expect(response.json().claimedAt).not.toBeNull();
    });

    it('answers 404 for the fee of somebody else, for a guardian too', async () => {
      const fee = await newFee(strangerMemberId);
      expect((await claim(athlete, fee.id)).statusCode).toBe(404);
      expect((await claim(guardian, fee.id)).statusCode).toBe(404);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: fee.id } })).claimedAt).toBeNull();
    });

    it.each([
      ['ADMIN', () => owner],
      ['SEGRETERIA', () => desk],
      ['ALLENATORE', () => coach],
    ] as const)('refuses %s: it is self-service for athletes and guardians', async (_role, actor) => {
      const fee = await newFee(athleteMemberId);
      expect((await claim(actor(), fee.id)).statusCode).toBe(403);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: fee.id } })).claimedAt).toBeNull();
    });

    it('answers 401 without a token', async () => {
      expect((await claim(null, 'x')).statusCode).toBe(401);
    });

    it('refuses a fee already paid and a cancelled one with 409', async () => {
      const paid = await newFee(athleteMemberId, { status: 'PAID' });
      const alreadyPaid = await claim(athlete, paid.id);
      expect(alreadyPaid.statusCode).toBe(409);
      expect(alreadyPaid.json()).toMatchObject({ code: 'fee_already_paid' });

      const cancelled = await newFee(athleteMemberId, { status: 'CANCELLED' });
      const gone = await claim(athlete, cancelled.id);
      expect(gone.statusCode).toBe(409);
      expect(gone.json()).toMatchObject({ code: 'fee_cancelled' });
    });

    it('does not leak fees of other societies', async () => {
      const fee = await newFee(athleteMemberId);
      const foreign = await createActor(ctx, outsider.societyId, 'ATLETA');
      expect((await claim(foreign, fee.id)).statusCode).toBe(404);
    });

    it('is idempotent: a second claim returns the fee unchanged and does not notify again', async () => {
      const society = await createSociety(ctx, 'Doppia ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const player = await createActor(ctx, society.id, 'ATLETA');
      const member = await createMember(ctx, society.id, { userId: player.user.id });
      const fee = await ctx.prisma.payment.create({
        data: { societyId: society.id, memberId: member.id, description: 'Quota', amountCents: 6000, dueDate: new Date('2026-11-10T00:00:00Z') },
      });

      const first = await claim(player, fee.id);
      const second = await claim(player, fee.id);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual(first.json());
      const rows = await ctx.prisma.notification.findMany({ where: { userId: admin.user.id, type: 'ADMIN_PAYMENT_CLAIMED' } });
      expect(rows.map((row) => row.channel).sort()).toEqual(['EMAIL', 'IN_APP']);
    });

    it('keeps claimedAt after the payment is registered', async () => {
      const fee = await newFee(athleteMemberId);
      const claimed = (await claim(athlete, fee.id)).json<{ claimedAt: string }>();
      const paid = await pay(desk, fee.id);
      expect(paid.statusCode).toBe(200);
      expect(paid.json()).toMatchObject({ status: 'PAID', claimedAt: claimed.claimedAt });
    });
  });

  describe('the notification to the administration', () => {
    it('tells administrators and secretaries, who can read it, and nobody else', async () => {
      const society = await createSociety(ctx, 'Avvisi ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const secretary = await createActor(ctx, society.id, 'SEGRETERIA');
      const trainer = await createActor(ctx, society.id, 'ALLENATORE');
      const parent = await createActor(ctx, society.id, 'GENITORE');
      const member = await createMember(ctx, society.id, { firstName: 'Giulia', lastName: 'Rossi' });
      await ctx.prisma.guardianLink.create({ data: { societyId: society.id, guardianUserId: parent.user.id, memberId: member.id } });
      const fee = await ctx.prisma.payment.create({
        data: { societyId: society.id, memberId: member.id, description: 'Quota novembre', amountCents: 6000, dueDate: new Date('2026-11-10T00:00:00Z') },
      });

      expect((await claim(parent, fee.id)).statusCode).toBe(200);

      const inApp = await ctx.prisma.notification.findMany({ where: { societyId: society.id, type: 'ADMIN_PAYMENT_CLAIMED', channel: 'IN_APP' } });
      expect(inApp.map((row) => row.userId).sort()).toEqual([admin.user.id, secretary.user.id].sort());
      expect(inApp[0]).toMatchObject({
        title: 'Pagamento segnalato',
        body: 'Per Giulia Rossi è stato segnalato il pagamento di «Quota novembre» (€ 60): controlla la banca e registra il pagamento',
        dedupeKey: `payment-claimed:${fee.id}`,
      });
      expect(inApp[0]?.data).toEqual({ feeId: fee.id, memberId: member.id });
      expect(await ctx.prisma.notification.count({ where: { userId: { in: [trainer.user.id, parent.user.id] } } })).toBe(0);

      const list = await call(admin, 'GET', '/notifications');
      expect(list.json().data.map((row: { type: string }) => row.type)).toContain('ADMIN_PAYMENT_CLAIMED');
    });

    it('still records the claim when the administration alerts are switched off', async () => {
      const society = await createSociety(ctx, 'Zitta ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const player = await createActor(ctx, society.id, 'ATLETA');
      const member = await createMember(ctx, society.id, { userId: player.user.id });
      await ctx.prisma.automation.create({ data: { societyId: society.id, key: 'admin-alerts', enabled: false } });
      const fee = await ctx.prisma.payment.create({
        data: { societyId: society.id, memberId: member.id, description: 'Quota', amountCents: 100, dueDate: new Date('2026-11-10T00:00:00Z') },
      });
      expect((await claim(player, fee.id)).json().claimedAt).not.toBeNull();
      expect(await ctx.prisma.notification.count({ where: { userId: admin.user.id } })).toBe(0);
    });
  });

  describe('filtering claimed fees', () => {
    it('lists only the unpaid fees that were claimed with claimed=true, and the others with claimed=false', async () => {
      const society = await createSociety(ctx, 'Filtro ASD');
      const admin = await createActor(ctx, society.id, 'SEGRETERIA');
      const player = await createActor(ctx, society.id, 'ATLETA');
      const mine = await createMember(ctx, society.id, { firstName: 'Mia', userId: player.user.id });
      const make = (memberId: string, extra: object = {}) =>
        ctx.prisma.payment.create({
          data: { societyId: society.id, memberId, description: 'Quota', amountCents: 6000, dueDate: new Date('2026-11-10T00:00:00Z'), ...extra },
        });
      const paidMember = await createMember(ctx, society.id, { firstName: 'Altra', fiscalCode: 'AAAAAA00A00A000A' });
      const otherMember = await createMember(ctx, society.id, { firstName: 'Terza', fiscalCode: 'BBBBBB00B00B000B' });
      const claimed = await make(mine.id);
      const claimedThenPaid = await make(paidMember.id, { status: 'PAID', paidAt: new Date(), method: 'CASH', claimedAt: new Date() });
      const untouched = await make(otherMember.id);
      expect((await claim(player, claimed.id)).statusCode).toBe(200);

      const ids = async (query: string) =>
        (await call(admin, 'GET', `/fees?limit=100${query}`)).json<{ data: { id: string }[] }>().data.map((fee) => fee.id);
      expect(await ids('&claimed=true')).toEqual([claimed.id]);
      expect(await ids('&claimed=false')).toEqual([untouched.id]);
      expect((await ids('')).sort()).toEqual([claimed.id, claimedThenPaid.id, untouched.id].sort());
      expect((await call(admin, 'GET', '/fees?claimed=maybe')).statusCode).toBe(422);
    });

    it('leaves the summary untouched', async () => {
      const response = await call(desk, 'GET', '/fees/summary?claimed=true');
      expect(response.statusCode).toBe(200);
      expect(Object.keys(response.json()).sort()).toEqual(
        ['daIncassareCents', 'incassatoCents', 'overdueCount', 'paidCount', 'pendingCount', 'promemoriaInviati', 'scadutoCents'],
      );
    });
  });

  describe('receipt notifications', () => {
    interface Scene {
      societyId: string;
      admin: Actor;
      secretary: Actor;
      player: Actor;
      parent: Actor;
      bystander: Actor;
      feeId: string;
    }
    async function scene(name: string): Promise<Scene> {
      const society = await createSociety(ctx, name);
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const secretary = await createActor(ctx, society.id, 'SEGRETERIA');
      const player = await createActor(ctx, society.id, 'ATLETA');
      const parent = await createActor(ctx, society.id, 'GENITORE');
      const bystander = await createActor(ctx, society.id, 'ATLETA');
      const member = await createMember(ctx, society.id, { firstName: 'Giulia', lastName: 'Rossi', userId: player.user.id });
      await createMember(ctx, society.id, { firstName: 'Luca', userId: bystander.user.id, fiscalCode: 'CCCCCC00C00C000C' });
      await ctx.prisma.guardianLink.create({ data: { societyId: society.id, guardianUserId: parent.user.id, memberId: member.id } });
      const fee = await ctx.prisma.payment.create({
        data: { societyId: society.id, memberId: member.id, description: 'Quota novembre', amountCents: 6000, dueDate: new Date('2026-11-10T00:00:00Z') },
      });
      return { societyId: society.id, admin, secretary, player, parent, bystander, feeId: fee.id };
    }

    it('tells the payer and the guardians, and the administration including who recorded the payment', async () => {
      const s = await scene('Ricevute ASD');
      const response = await pay(s.admin, s.feeId);
      expect(response.statusCode).toBe(200);
      expect(response.json().receipt).toMatchObject({ number: 1, code: '0001' });

      for (const payer of [s.player, s.parent]) {
        const rows = await notificationsOf(payer.user.id, 'RECEIPT_ISSUED');
        expect(rows.map((row) => row.channel)).toEqual(['EMAIL', 'IN_APP']);
        expect(rows[0]).toMatchObject({
          title: 'Ricevuta emessa',
          body: 'Ricevuta n. 0001 emessa: Quota novembre, € 60. La trovi in Pagamenti.',
          dedupeKey: expect.stringMatching(/^receipt-issued:/),
        });
        expect(rows[0]?.data).toEqual({ feeId: s.feeId, memberId: expect.any(String) });
      }
      for (const staff of [s.admin, s.secretary]) {
        const rows = await notificationsOf(staff.user.id, 'RECEIPT_ISSUED');
        expect(rows.map((row) => row.channel)).toEqual(['EMAIL', 'IN_APP']);
        expect(rows[0]?.body).toBe('Ricevuta n. 0001 emessa per Giulia Rossi: Quota novembre, € 60. La trovi in Quote.');
      }
      expect(await notificationsOf(s.bystander.user.id, 'RECEIPT_ISSUED')).toEqual([]);
    });

    it('lets the payer read the notification in the center and download the receipt', async () => {
      const s = await scene('Centro ASD');
      await pay(s.secretary, s.feeId);
      for (const payer of [s.player, s.parent]) {
        const list = await call(payer, 'GET', '/notifications');
        expect(list.json().data.map((row: { type: string }) => row.type)).toEqual(['RECEIPT_ISSUED']);
        const pdf = await call(payer, 'GET', `/fees/${s.feeId}/receipt`);
        expect(pdf.statusCode).toBe(200);
        expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      }
      expect((await call(s.bystander, 'GET', `/fees/${s.feeId}/receipt`)).statusCode).toBe(404);
      expect((await call(s.admin, 'GET', `/fees/${s.feeId}/receipt`)).statusCode).toBe(200);
    });

    it('sets Receipt.sentAt and shows it on the fee', async () => {
      const s = await scene('Invio ASD');
      const paid = await pay(s.secretary, s.feeId);
      expect(paid.json().receipt.sentAt).toBeNull();
      const stored = await ctx.prisma.receipt.findUniqueOrThrow({ where: { paymentId: s.feeId } });
      expect(stored.sentAt).not.toBeNull();
      expect((await call(s.secretary, 'GET', `/fees/${s.feeId}`)).json().receipt.sentAt).toBe(stored.sentAt?.toISOString());
    });

    it('sends nothing, and leaves sentAt empty, while the receipts automation is off', async () => {
      const s = await scene('Spenta ASD');
      await ctx.prisma.automation.create({ data: { societyId: s.societyId, key: 'receipts', enabled: false } });
      const paid = await pay(s.secretary, s.feeId);
      expect(paid.json().receipt).toBeNull();
      expect(await ctx.prisma.notification.count({ where: { societyId: s.societyId, type: 'RECEIPT_ISSUED' } })).toBe(0);
    });

    it('notifies when the receipt is issued by hand afterwards, and returns the fee with sentAt', async () => {
      const s = await scene('Manuale ASD');
      await ctx.prisma.automation.create({ data: { societyId: s.societyId, key: 'receipts', enabled: false } });
      await pay(s.secretary, s.feeId);

      const issued = await call(s.secretary, 'POST', `/fees/${s.feeId}/receipt`);
      expect(issued.statusCode).toBe(201);
      expect(issued.json().receipt).toMatchObject({ code: '0001', sentAt: expect.any(String) });
      expect((await notificationsOf(s.player.user.id, 'RECEIPT_ISSUED')).map((row) => row.channel)).toEqual(['EMAIL', 'IN_APP']);
      expect((await notificationsOf(s.secretary.user.id, 'RECEIPT_ISSUED')).map((row) => row.channel)).toEqual(['EMAIL', 'IN_APP']);
      expect((await call(s.secretary, 'POST', `/fees/${s.feeId}/receipt`)).statusCode).toBe(409);
      expect(await ctx.prisma.notification.count({ where: { societyId: s.societyId, type: 'RECEIPT_ISSUED', userId: s.player.user.id } })).toBe(2);
    });

    it('does not notify twice when the same payment request is replayed', async () => {
      const s = await scene('Replay ASD');
      const key = randomUUID();
      expect((await pay(s.secretary, s.feeId, key)).statusCode).toBe(200);
      expect((await pay(s.secretary, s.feeId, key)).headers['idempotent-replayed']).toBe('true');
      expect(await ctx.prisma.notification.count({ where: { societyId: s.societyId, type: 'RECEIPT_ISSUED' } })).toBe(8);
    });

    it('respects the preferences of the user for the email channel', async () => {
      const s = await scene('Preferenze ASD');
      await ctx.prisma.notificationPreference.create({
        data: { societyId: s.societyId, userId: s.parent.user.id, type: 'RECEIPT_ISSUED', channel: 'EMAIL', enabled: false },
      });
      await pay(s.secretary, s.feeId);
      expect((await notificationsOf(s.parent.user.id, 'RECEIPT_ISSUED')).map((row) => row.channel)).toEqual(['IN_APP']);
    });

    it('offers the type in the preferences of both audiences', async () => {
      const s = await scene('Tipi ASD');
      for (const actor of [s.admin, s.player, s.parent]) {
        const preferences = (await call(actor, 'GET', '/notifications/preferences')).json<{ preferences: { type: string }[] }>().preferences;
        expect(preferences.map((item) => item.type)).toContain('RECEIPT_ISSUED');
      }
    });
  });
});
