import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTOMATION_CATALOG } from '../src/jobs/catalog.js';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, type Actor } from './helpers/factories.js';

describe('automations dashboard (SPEC 08)', () => {
  let ctx: TestContext;
  let societyId: string;
  const actors = {} as Record<Role, Actor>;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Gestione ASD')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const call = (method: 'GET' | 'PATCH' | 'POST', actor: Actor | null, path: string, payload?: object) =>
    ctx.app.inject({ method, url: `${API}${path}`, headers: actor?.headers, payload });
  const freshAdmin = async (name: string) => createActor(ctx, (await createSociety(ctx, name)).id, 'ADMIN');

  describe('authorization', () => {
    it('answers 401 without a token', async () => {
      for (const [method, path] of [
        ['GET', '/automations'],
        ['PATCH', '/automations/fee-reminders'],
        ['GET', '/automations/fee-reminders/runs'],
        ['POST', '/automations/fee-reminders/run'],
      ] as const) {
        expect((await call(method, null, path)).statusCode, `${method} ${path}`).toBe(401);
      }
    });

    it.each(ROLES)('%s reads the dashboard only if admin or segreteria', async (role) => {
      const expected = role === 'ADMIN' || role === 'SEGRETERIA' ? 200 : 403;
      expect((await call('GET', actors[role], '/automations')).statusCode).toBe(expected);
      expect((await call('GET', actors[role], '/automations/fee-reminders/runs')).statusCode).toBe(expected);
    });

    it.each(ROLES)('%s changes or runs automations only if admin', async (role) => {
      const expected = role === 'ADMIN' ? 200 : 403;
      expect((await call('PATCH', actors[role], '/automations/fee-reminders', { enabled: true })).statusCode).toBe(expected);
      expect((await call('POST', actors[role], '/automations/housekeeping/run')).statusCode).toBe(role === 'ADMIN' ? 404 : 403);
    });
  });

  // The dashboard percentage is active / total over the whole catalog.
  const TOTAL = AUTOMATION_CATALOG.length;
  const percentOf = (active: number): number => Math.round((active / TOTAL) * 100);

  describe('dashboard', () => {
    it('lists the activities of the catalog, all on, with 100% active', async () => {
      const admin = await freshAdmin('Dashboard ASD');
      const body = (await call('GET', admin, '/automations')).json();
      expect(body.data.map((item: { name: string }) => item.name)).toEqual([
        'Ricordare le quote',
        'Controllare i certificati',
        'Inviare le convocazioni',
        'Aggiornare le classifiche',
        'Emettere le ricevute',
        'Avvisare atleti e genitori',
        "Avvisare l'amministrazione",
      ]);
      expect(body.data.map((item: { key: string }) => item.key)).toEqual(AUTOMATION_CATALOG.map((entry) => entry.key));
      expect(body.summary).toEqual({ active: TOTAL, total: TOTAL, percentage: 100 });
      const byKey = Object.fromEntries(body.data.map((item: { key: string }) => [item.key, item]));
      expect(byKey['fee-reminders']).toMatchObject({
        kind: 'SCHEDULED',
        schedule: '0 9 * * *',
        enabled: true,
        toggleable: true,
        runnable: true,
        state: 'WAITING',
        lastRun: null,
        lastRunAt: null,
        config: { beforeDueDays: [1, 7], afterDueDays: [3, 10], hour: 9, channels: ['IN_APP', 'EMAIL'] },
      });
      expect(byKey['certificate-reminders']).toMatchObject({ schedule: '0 8 * * *' });
      expect(byKey['certificate-reminders'].config).toEqual({ thresholdsDays: [0, 7, 15, 30], hour: 8, channels: ['IN_APP', 'EMAIL'] });
      expect(byKey.standings).toMatchObject({ kind: 'EVENT', schedule: null, toggleable: false, runnable: false, state: 'COMPLETED' });
      expect(byKey.receipts).toMatchObject({ kind: 'EVENT', toggleable: true, runnable: false, state: 'COMPLETED' });
      expect(byKey['notifications-dispatch']).toMatchObject({ schedule: '*/10 * * * *', config: { maxAttempts: 3, batchSize: 100 } });
    });

    it('switching one automation off lowers the percentage and shows it as disabled', async () => {
      const admin = await freshAdmin('Spegni ASD');
      const off = await call('PATCH', admin, '/automations/fee-reminders', { enabled: false });
      expect(off.statusCode).toBe(200);
      expect(off.json()).toMatchObject({ key: 'fee-reminders', enabled: false, state: 'DISABLED' });
      expect((await call('GET', admin, '/automations')).json().summary).toEqual({ active: TOTAL - 1, total: TOTAL, percentage: percentOf(TOTAL - 1) });
      await call('PATCH', admin, '/automations/certificate-reminders', { enabled: false });
      await call('PATCH', admin, '/automations/receipts', { enabled: false });
      expect((await call('GET', admin, '/automations')).json().summary).toEqual({ active: TOTAL - 3, total: TOTAL, percentage: percentOf(TOTAL - 3) });
      await call('PATCH', admin, '/automations/fee-reminders', { enabled: true });
      expect((await call('GET', admin, '/automations')).json().summary.active).toBe(TOTAL - 2);
    });

    it('keeps the societies apart', async () => {
      const first = await freshAdmin('Prima ASD');
      const second = await freshAdmin('Seconda ASD');
      await call('PATCH', first, '/automations/fee-reminders', { enabled: false, config: { afterDueDays: [5] } });
      const other = (await call('GET', second, '/automations')).json();
      expect(other.summary.active).toBe(TOTAL);
      expect(other.data[0].config.afterDueDays).toEqual([3, 10]);
    });
  });

  describe('update', () => {
    it('refuses to switch off the derived standings, but accepts enabling them', async () => {
      const admin = await freshAdmin('Classifica ASD');
      const response = await call('PATCH', admin, '/automations/standings', { enabled: false });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'automation_not_toggleable' });
      expect((await call('PATCH', admin, '/automations/standings', { enabled: true })).statusCode).toBe(200);
    });

    it('validates the settings per key, merges them into the stored ones and normalises lists', async () => {
      const admin = await freshAdmin('Config ASD');
      const merged = await call('PATCH', admin, '/automations/fee-reminders', { config: { afterDueDays: [10, 5, 5] } });
      expect(merged.statusCode).toBe(200);
      expect(merged.json().config).toEqual({ beforeDueDays: [1, 7], afterDueDays: [5, 10], hour: 9, channels: ['IN_APP', 'EMAIL'] });
      const again = await call('PATCH', admin, '/automations/fee-reminders', { config: { beforeDueDays: [3] } });
      expect(again.json().config).toEqual({ beforeDueDays: [3], afterDueDays: [5, 10], hour: 9, channels: ['IN_APP', 'EMAIL'] });

      const certificates = await call('PATCH', admin, '/automations/certificate-reminders', { config: { thresholdsDays: [60, 30, 0] } });
      expect(certificates.json().config).toEqual({ thresholdsDays: [0, 30, 60], hour: 8, channels: ['IN_APP', 'EMAIL'] });
      const dispatch = await call('PATCH', admin, '/automations/notifications-dispatch', { config: { maxAttempts: 5 } });
      expect(dispatch.json().config).toEqual({ maxAttempts: 5, batchSize: 100 });
      const convocations = await call('PATCH', admin, '/automations/convocation-dispatch', { config: { daysBefore: 5, remindNonRespondents: false } });
      expect(convocations.json().config).toEqual({
        daysBefore: 5,
        remindNonRespondents: false,
        reminderDaysBefore: 1,
        hour: 9,
        channels: ['IN_APP', 'EMAIL'],
      });
    });

    it('rejects invalid settings with field errors and leaves the stored ones untouched', async () => {
      const admin = await freshAdmin('Errori ASD');
      for (const [key, config, path] of [
        ['certificate-reminders', { thresholdsDays: [-1] }, 'config.thresholdsDays.0'],
        ['certificate-reminders', { thresholdsDays: [1000] }, 'config.thresholdsDays.0'],
        ['fee-reminders', { beforeDueDays: [0] }, 'config.beforeDueDays.0'],
        ['notifications-dispatch', { maxAttempts: 0 }, 'config.maxAttempts'],
        ['convocation-dispatch', { daysBefore: 'tre' }, 'config.daysBefore'],
        ['fee-reminders', { hour: 24 }, 'config.hour'],
        ['certificate-reminders', { hour: -1 }, 'config.hour'],
        ['convocation-dispatch', { hour: 8.5 }, 'config.hour'],
        ['fee-reminders', { channels: [] }, 'config.channels'],
        ['certificate-reminders', { channels: ['SMS'] }, 'config.channels.0'],
        ['convocation-dispatch', { channels: 'EMAIL' }, 'config.channels'],
        ['notifications-dispatch', { hour: 8 }, 'config'],
        ['fee-reminders', { unknownSetting: 1 }, 'config'],
        ['receipts', { anything: true }, 'config'],
      ] as const) {
        const response = await call('PATCH', admin, `/automations/${key}`, { config });
        expect(response.statusCode, `${key} ${JSON.stringify(config)}`).toBe(422);
        expect(response.json()).toMatchObject({ code: 'invalid_automation_config' });
        expect(response.json().errors.map((error: { path: string }) => error.path)).toContain(path);
      }
      const dashboard = (await call('GET', admin, '/automations')).json();
      expect(dashboard.data.find((item: { key: string }) => item.key === 'certificate-reminders').config).toEqual({
        thresholdsDays: [0, 7, 15, 30],
        hour: 8,
        channels: ['IN_APP', 'EMAIL'],
      });
    });

    it('rejects an empty body and unknown automations', async () => {
      const admin = await freshAdmin('Vuoto ASD');
      expect((await call('PATCH', admin, '/automations/fee-reminders', {})).statusCode).toBe(422);
      expect((await call('PATCH', admin, '/automations/nope', { enabled: false })).statusCode).toBe(404);
      expect((await call('PATCH', admin, '/automations/housekeeping', { enabled: false })).statusCode).toBe(404);
      expect((await call('GET', admin, '/automations/nope/runs')).statusCode).toBe(404);
    });
  });

  describe('execution log and manual run', () => {
    it('runs a scheduled automation now, logs it and reports it on the dashboard', async () => {
      const admin = await freshAdmin('Esegui ASD');
      expect((await call('GET', admin, '/automations/certificate-reminders/runs')).json()).toEqual({
        data: [],
        page: { nextCursor: null, hasMore: false },
      });

      const run = await call('POST', admin, '/automations/certificate-reminders/run');
      expect(run.statusCode).toBe(200);
      expect(run.json()).toMatchObject({
        automationKey: 'certificate-reminders',
        status: 'SUCCESS',
        error: null,
        result: { documentsChecked: 0, documentsNotified: 0, notifications: 0 },
      });
      expect(run.json().runKey).toMatch(/^manual:/);

      const runs = (await call('GET', admin, '/automations/certificate-reminders/runs')).json();
      expect(runs.data).toHaveLength(1);
      expect(runs.data[0].id).toBe(run.json().id);

      const dashboard = (await call('GET', admin, '/automations')).json();
      const item = dashboard.data.find((entry: { key: string }) => entry.key === 'certificate-reminders');
      expect(item).toMatchObject({ state: 'COMPLETED', lastRun: { id: run.json().id, status: 'SUCCESS' } });
      expect(item.lastRunAt).not.toBeNull();
    });

    it('paginates the log newest first', async () => {
      const admin = await freshAdmin('Log ASD');
      const ids: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        ids.push((await call('POST', admin, '/automations/fee-reminders/run')).json().id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const first = (await call('GET', admin, '/automations/fee-reminders/runs?limit=2')).json();
      expect(first.data.map((item: { id: string }) => item.id)).toEqual([ids[2], ids[1]]);
      expect(first.page.hasMore).toBe(true);
      const second = (await call('GET', admin, `/automations/fee-reminders/runs?limit=2&cursor=${first.page.nextCursor}`)).json();
      expect(second.data.map((item: { id: string }) => item.id)).toEqual([ids[0]]);
      expect((await call('GET', admin, '/automations/fee-reminders/runs?cursor=bad')).statusCode).toBe(400);
    });

    it('never shows the runs of another society', async () => {
      const first = await freshAdmin('Log uno ASD');
      const second = await freshAdmin('Log due ASD');
      await call('POST', first, '/automations/fee-reminders/run');
      expect((await call('GET', second, '/automations/fee-reminders/runs')).json().data).toEqual([]);
    });

    it('refuses to run what cannot be run: disabled, event-driven or not yet available automations', async () => {
      const admin = await freshAdmin('Rifiuti ASD');
      await call('PATCH', admin, '/automations/fee-reminders', { enabled: false });
      const disabled = await call('POST', admin, '/automations/fee-reminders/run');
      expect(disabled.statusCode).toBe(409);
      expect(disabled.json()).toMatchObject({ code: 'automation_disabled' });
      expect((await call('POST', admin, '/automations/standings/run')).json()).toMatchObject({ code: 'automation_not_runnable' });
      expect((await call('POST', admin, '/automations/receipts/run')).statusCode).toBe(409);
      expect((await call('POST', admin, '/automations/nope/run')).statusCode).toBe(404);
    });

    it('lists a failed run with its error', async () => {
      const admin = await freshAdmin('Fallita ASD');
      const automation = await ctx.prisma.automation.create({
        data: { societyId: admin.societyId, key: 'fee-reminders', enabled: true },
      });
      await ctx.prisma.automationRun.create({
        data: { societyId: admin.societyId, automationId: automation.id, runKey: 'k1', status: 'FAILED', error: 'boom', finishedAt: new Date() },
      });
      const dashboard = (await call('GET', admin, '/automations')).json();
      expect(dashboard.data[0]).toMatchObject({ state: 'FAILED', lastRun: { status: 'FAILED', error: 'boom' } });
    });
  });

  describe('receipts automation (event-driven)', () => {
    const createPaymentFor = async (societyForPayment: string) => {
      const member = await createMember(ctx, societyForPayment);
      return ctx.prisma.payment.create({
        data: {
          societyId: societyForPayment,
          memberId: member.id,
          description: 'Quota novembre',
          amountCents: 6000,
          dueDate: new Date('2026-11-15T00:00:00.000Z'),
        },
      });
    };
    const pay = (actor: Actor, id: string) =>
      ctx.app.inject({
        method: 'POST',
        url: `${API}/fees/${id}/pay`,
        headers: { ...actor.headers, 'idempotency-key': randomUUID() },
        payload: { method: 'CASH' },
      });

    it('issues the receipt when a payment is registered and logs it', async () => {
      const admin = await freshAdmin('Ricevute ASD');
      const payment = await createPaymentFor(admin.societyId);
      const paid = await pay(admin, payment.id);
      expect(paid.statusCode).toBe(200);
      expect(paid.json().receipt).toMatchObject({ number: 1 });

      const runs = (await call('GET', admin, '/automations/receipts/runs')).json();
      expect(runs.data).toHaveLength(1);
      expect(runs.data[0]).toMatchObject({ status: 'SUCCESS', runKey: `receipt:${payment.id}`, result: { paymentId: payment.id, number: 1 } });
    });

    it('records the payment without a receipt while the automation is off, and lets the receipt be issued by hand', async () => {
      const admin = await freshAdmin('Ricevute spente ASD');
      await call('PATCH', admin, '/automations/receipts', { enabled: false });
      const payment = await createPaymentFor(admin.societyId);

      const paid = await pay(admin, payment.id);
      expect(paid.statusCode).toBe(200);
      expect(paid.json()).toMatchObject({ status: 'PAID', receipt: null });
      expect(await ctx.prisma.receipt.count({ where: { societyId: admin.societyId } })).toBe(0);
      expect((await call('GET', admin, `/fees/${payment.id}/receipt`)).statusCode).toBe(404);

      const issued = await call('POST', admin, `/fees/${payment.id}/receipt`);
      expect(issued.statusCode).toBe(201);
      expect(issued.json().receipt).toMatchObject({ number: 1, code: '0001' });
      expect((await call('GET', admin, `/fees/${payment.id}/receipt`)).statusCode).toBe(200);
      expect((await call('POST', admin, `/fees/${payment.id}/receipt`)).json()).toMatchObject({ code: 'receipt_already_issued' });
    });

    it('does not issue a receipt for an unpaid fee, for another society, or without the permission', async () => {
      const admin = await freshAdmin('Ricevute errori ASD');
      const outsider = await freshAdmin('Ricevute estranea ASD');
      const payment = await createPaymentFor(admin.societyId);
      expect((await call('POST', admin, `/fees/${payment.id}/receipt`)).json()).toMatchObject({ code: 'fee_not_paid' });
      expect((await call('POST', outsider, `/fees/${payment.id}/receipt`)).statusCode).toBe(404);
      expect((await call('POST', actors.ALLENATORE, `/fees/${payment.id}/receipt`)).statusCode).toBe(403);
      expect((await call('POST', admin, '/fees/missing/receipt')).statusCode).toBe(404);
    });
  });
});
