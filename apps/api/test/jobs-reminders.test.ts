import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convocationDispatch } from '../src/jobs/definitions/convocation-dispatch.js';
import { certificateReminders, thresholdFor } from '../src/jobs/definitions/certificate-reminders.js';
import { currentStep, feeReminders, reminderSteps } from '../src/jobs/definitions/fee-reminders.js';
import { builtInAutomations } from '../src/jobs/definitions/index.js';
import { notificationsDispatch } from '../src/jobs/definitions/notifications-dispatch.js';
import type { AutomationDefinition } from '../src/jobs/registry.js';
import { runAutomation } from '../src/jobs/runner.js';
import type { EmailTransport } from '../src/lib/email.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety } from './helpers/factories.js';

const at = (date: string, time = '08:00:00') => new Date(`${date}T${time}.000Z`);

describe('reminder steps (unit)', () => {
  it('picks the smallest certificate threshold that covers the remaining days', () => {
    const thresholds = [0, 7, 15, 30];
    expect([45, 31, 30, 20, 15, 10, 7, 3, 0, -5].map((days) => thresholdFor(days, thresholds))).toEqual([
      null, null, 30, 30, 15, 15, 7, 7, 0, 0,
    ]);
    expect(thresholdFor(5, [])).toBeNull();
  });

  it('turns the fee settings into day offsets and picks the latest step already reached', () => {
    const steps = reminderSteps([7, 1], [10, 3]);
    expect(steps).toEqual([-7, -1, 3, 10]);
    expect([-10, -7, -3, -1, 0, 2, 3, 9, 10, 200].map((offset) => currentStep(offset, steps))).toEqual([
      null, -7, -7, -1, -1, -1, 3, 3, 10, 10,
    ]);
  });
});

describe('automation jobs', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const run = (definition: AutomationDefinition, societyId: string, now: Date, extra: { runKey?: string; email?: EmailTransport | null } = {}) =>
    runAutomation({ prisma: ctx.prisma, definition, societyId, now, log: ctx.app.log, ...extra });

  // An athlete with an account, a linked guardian and a medical certificate expiring on `expiresOn`.
  async function athleteWithCertificate(societyId: string, expiresOn: string | null, firstName = 'Sara') {
    const athleteActor = await createActor(ctx, societyId, 'ATLETA');
    const guardianActor = await createActor(ctx, societyId, 'GENITORE');
    const member = await createMember(ctx, societyId, { firstName, lastName: 'Conti', userId: athleteActor.user.id });
    await ctx.prisma.guardianLink.create({ data: { societyId, guardianUserId: guardianActor.user.id, memberId: member.id } });
    const type =
      (await ctx.prisma.documentType.findFirst({ where: { societyId, key: 'MEDICAL_CERTIFICATE' } })) ??
      (await ctx.prisma.documentType.create({
        data: { societyId, key: 'MEDICAL_CERTIFICATE', name: 'Certificato medico', requiresExpiry: true },
      }));
    const document = expiresOn
      ? await ctx.prisma.document.create({
          data: { societyId, memberId: member.id, documentTypeId: type.id, expiresAt: at(expiresOn, '00:00:00') },
        })
      : null;
    return { athleteActor, guardianActor, member, type, document };
  }

  describe('certificate-reminders (SPEC 02)', () => {
    it('warns the athlete and the guardians at each threshold, once per threshold', async () => {
      const society = await createSociety(ctx, 'Certificati ASD');
      const { athleteActor, guardianActor, document } = await athleteWithCertificate(society.id, '2026-11-30');

      // 20 days left -> threshold 30
      let outcome = await run(certificateReminders, society.id, at('2026-11-10'));
      expect(outcome).toMatchObject({ status: 'SUCCESS', result: { documentsChecked: 1, documentsNotified: 1, notifications: 4 } });
      const inApp = await ctx.prisma.notification.findMany({ where: { societyId: society.id, channel: 'IN_APP' }, orderBy: { userId: 'asc' } });
      expect(inApp.map((row) => row.userId).sort()).toEqual([athleteActor.user.id, guardianActor.user.id].sort());
      expect(inApp[0]).toMatchObject({
        type: 'CERTIFICATE_EXPIRING',
        title: 'Documento in scadenza',
        body: 'Sara Conti · Certificato medico — scade tra 20 giorni',
      });
      expect(inApp[0]?.data).toMatchObject({ documentId: document?.id, daysLeft: 20 });
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, channel: 'EMAIL', status: 'PENDING' } })).toBe(2);

      // 19 days left: same threshold, nothing new
      outcome = await run(certificateReminders, society.id, at('2026-11-11'));
      expect(outcome).toMatchObject({ result: { documentsNotified: 0, notifications: 0 } });

      // 15 days left -> threshold 15
      outcome = await run(certificateReminders, society.id, at('2026-11-15'));
      expect(outcome).toMatchObject({ result: { documentsNotified: 1, notifications: 4 } });

      // 3 days left -> 7; expiry day -> 0; after expiry: no more reminders
      expect(await run(certificateReminders, society.id, at('2026-11-27'))).toMatchObject({ result: { notifications: 4 } });
      expect(await run(certificateReminders, society.id, at('2026-11-30'))).toMatchObject({ result: { notifications: 4 } });
      expect(await run(certificateReminders, society.id, at('2026-12-05'))).toMatchObject({ result: { notifications: 0 } });
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, channel: 'IN_APP' } })).toBe(8);
      const last = await ctx.prisma.notification.findFirstOrThrow({ where: { societyId: society.id, dedupeKey: { endsWith: ':0' } } });
      expect(last.body).toContain('scade oggi');
    });

    it('is idempotent: re-running the same bucket changes nothing', async () => {
      const society = await createSociety(ctx, 'Certificati bis ASD');
      await athleteWithCertificate(society.id, '2026-11-20');
      expect(await run(certificateReminders, society.id, at('2026-11-10'))).toMatchObject({ status: 'SUCCESS' });
      expect(await run(certificateReminders, society.id, at('2026-11-10', '09:00:00'))).toEqual({ status: 'SKIPPED_ALREADY_RAN' });
      expect(await run(certificateReminders, society.id, at('2026-11-10'), { runKey: 'forced' })).toMatchObject({
        result: { documentsNotified: 0, notifications: 0 },
      });
    });

    it('ignores far-away expiries, inactive members and certificates replaced by a newer one', async () => {
      const society = await createSociety(ctx, 'Certificati ter ASD');
      await athleteWithCertificate(society.id, '2027-06-30', 'Lontana');
      const inactive = await athleteWithCertificate(society.id, '2026-11-12', 'Inattiva');
      await ctx.prisma.member.update({ where: { id: inactive.member.id }, data: { status: 'INACTIVE' } });
      const renewed = await athleteWithCertificate(society.id, '2026-11-05', 'Rinnovata');
      await ctx.prisma.document.create({
        data: { societyId: society.id, memberId: renewed.member.id, documentTypeId: renewed.type.id, expiresAt: at('2027-11-05', '00:00:00') },
      });
      await athleteWithCertificate(society.id, null, 'SenzaDocumento');

      const outcome = await run(certificateReminders, society.id, at('2026-11-10'));
      expect(outcome).toMatchObject({ status: 'SUCCESS', result: { notifications: 0, documentsNotified: 0 } });
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id } })).toBe(0);
    });

    it('follows the configured thresholds and the on/off switch', async () => {
      const society = await createSociety(ctx, 'Certificati soglie ASD');
      await athleteWithCertificate(society.id, '2026-11-25');
      await ctx.prisma.automation.create({
        data: { societyId: society.id, key: 'certificate-reminders', enabled: true, config: { thresholdsDays: [5] } },
      });
      // 15 days left is beyond the only threshold (5): nothing
      expect(await run(certificateReminders, society.id, at('2026-11-10'))).toMatchObject({ result: { documentsChecked: 0 } });
      expect(await run(certificateReminders, society.id, at('2026-11-21'))).toMatchObject({ result: { documentsNotified: 1 } });

      await ctx.prisma.automation.updateMany({ where: { societyId: society.id }, data: { enabled: false } });
      expect(await run(certificateReminders, society.id, at('2026-11-22'))).toEqual({ status: 'SKIPPED_DISABLED' });
    });

    it('respects the notification preferences and only touches its own society', async () => {
      const society = await createSociety(ctx, 'Certificati pref ASD');
      const other = await createSociety(ctx, 'Certificati altra ASD');
      const mine = await athleteWithCertificate(society.id, '2026-11-20');
      await athleteWithCertificate(other.id, '2026-11-20');
      await ctx.prisma.notificationPreference.create({
        data: { societyId: society.id, userId: mine.guardianActor.user.id, type: 'CERTIFICATE_EXPIRING', channel: 'IN_APP', enabled: false },
      });
      await run(certificateReminders, society.id, at('2026-11-10'));
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, userId: mine.guardianActor.user.id, channel: 'IN_APP' } })).toBe(0);
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, userId: mine.athleteActor.user.id, channel: 'IN_APP' } })).toBe(1);
      expect(await ctx.prisma.notification.count({ where: { societyId: other.id } })).toBe(0);
    });
  });

  describe('fee-reminders (SPEC 03)', () => {
    async function payerWithFee(societyId: string, dueDate: string, overrides: { status?: string } = {}) {
      const athleteActor = await createActor(ctx, societyId, 'ATLETA');
      const member = await createMember(ctx, societyId, { userId: athleteActor.user.id });
      const payment = await ctx.prisma.payment.create({
        data: {
          societyId,
          memberId: member.id,
          description: 'Quota novembre',
          amountCents: 6000,
          dueDate: at(dueDate, '00:00:00'),
          ...overrides,
        },
      });
      return { athleteActor, member, payment };
    }

    it('reminds before the due date and follows up after it, once per step, counting the reminders', async () => {
      const society = await createSociety(ctx, 'Quote ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const { athleteActor, payment } = await payerWithFee(society.id, '2026-11-15');
      const count = async () => (await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).reminderCount;

      expect(await run(feeReminders, society.id, at('2026-11-07'))).toMatchObject({ result: { feesChecked: 0, remindersSent: 0 } });
      expect(await run(feeReminders, society.id, at('2026-11-08'))).toMatchObject({ result: { feesChecked: 1, remindersSent: 1 } });
      expect(await count()).toBe(1);
      const first = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: athleteActor.user.id, channel: 'IN_APP' } });
      expect(first).toMatchObject({ type: 'FEE_DUE', title: 'Quota in scadenza' });
      expect(first.body).toBe('Quota novembre · € 60 · scade il 15 novembre (tra 7 giorni)');
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).lastReminderAt).toEqual(at('2026-11-08'));

      // same step on the following days: nothing
      expect(await run(feeReminders, society.id, at('2026-11-09'))).toMatchObject({ result: { remindersSent: 0 } });
      expect(await count()).toBe(1);

      await run(feeReminders, society.id, at('2026-11-14')); // 1 day before
      await run(feeReminders, society.id, at('2026-11-15')); // due day: still the same step
      await run(feeReminders, society.id, at('2026-11-18')); // 3 days overdue
      await run(feeReminders, society.id, at('2026-11-25')); // 10 days overdue
      await run(feeReminders, society.id, at('2026-12-25')); // nothing left to send
      expect(await count()).toBe(4);
      const overdue = await ctx.prisma.notification.findFirstOrThrow({
        where: { userId: athleteActor.user.id, channel: 'IN_APP', title: 'Quota scaduta' },
        orderBy: { createdAt: 'desc' },
      });
      expect(overdue.body).toContain('scaduta il 15 novembre');

      // the counter feeds "Promemoria inviati" of the fees summary
      const summary = await ctx.app.inject({ method: 'GET', url: `${API}/fees/summary`, headers: admin.headers });
      expect(summary.json().promemoriaInviati).toBe(4);
    });

    it('does not remind paid or cancelled fees, inactive members, or members nobody can be notified for', async () => {
      const society = await createSociety(ctx, 'Quote bis ASD');
      await payerWithFee(society.id, '2026-11-10', { status: 'PAID' });
      await payerWithFee(society.id, '2026-11-10', { status: 'CANCELLED' });
      const inactive = await payerWithFee(society.id, '2026-11-10');
      await ctx.prisma.member.update({ where: { id: inactive.member.id }, data: { status: 'INACTIVE' } });
      const orphanMember = await createMember(ctx, society.id, { firstName: 'Senza', lastName: 'Account' });
      const orphan = await ctx.prisma.payment.create({
        data: { societyId: society.id, memberId: orphanMember.id, description: 'Quota', amountCents: 5000, dueDate: at('2026-11-10', '00:00:00') },
      });

      const outcome = await run(feeReminders, society.id, at('2026-11-20'));
      expect(outcome).toMatchObject({ status: 'SUCCESS', result: { remindersSent: 0 } });
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id } })).toBe(0);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: orphan.id } })).reminderCount).toBe(0);
    });

    it('reaches the guardians too and follows the configured days and the on/off switch', async () => {
      const society = await createSociety(ctx, 'Quote ter ASD');
      const { member, athleteActor, payment } = await payerWithFee(society.id, '2026-11-15');
      const guardianActor = await createActor(ctx, society.id, 'GENITORE');
      await ctx.prisma.guardianLink.create({ data: { societyId: society.id, guardianUserId: guardianActor.user.id, memberId: member.id } });
      await ctx.prisma.automation.create({
        data: { societyId: society.id, key: 'fee-reminders', enabled: true, config: { beforeDueDays: [2], afterDueDays: [] } },
      });

      expect(await run(feeReminders, society.id, at('2026-11-10'))).toMatchObject({ result: { remindersSent: 0 } });
      expect(await run(feeReminders, society.id, at('2026-11-13'))).toMatchObject({ result: { remindersSent: 1 } });
      const recipients = await ctx.prisma.notification.findMany({ where: { societyId: society.id, channel: 'IN_APP' } });
      expect(recipients.map((row) => row.userId).sort()).toEqual([athleteActor.user.id, guardianActor.user.id].sort());
      // no follow-ups configured: being overdue triggers nothing more
      expect(await run(feeReminders, society.id, at('2026-11-20'))).toMatchObject({ result: { remindersSent: 0 } });
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).reminderCount).toBe(1);

      await ctx.prisma.automation.updateMany({ where: { societyId: society.id }, data: { enabled: false } });
      expect(await run(feeReminders, society.id, at('2026-11-21'))).toEqual({ status: 'SKIPPED_DISABLED' });
    });
  });

  describe('notifications-dispatch', () => {
    it('delivers the queued emails through the provider, 10-minute buckets, and logs the result', async () => {
      const society = await createSociety(ctx, 'Dispatch ASD');
      await athleteWithCertificate(society.id, '2026-11-20');
      await run(certificateReminders, society.id, at('2026-11-10'));
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, channel: 'EMAIL', status: 'PENDING' } })).toBe(2);

      const sent: string[] = [];
      const transport: EmailTransport = {
        provider: 'test',
        async send(message) {
          sent.push(message.to);
          return { ok: true, providerId: null };
        },
      };
      const now = at('2026-11-10', '09:03:00');
      expect(await run(notificationsDispatch, society.id, now, { email: transport })).toMatchObject({
        status: 'SUCCESS',
        result: { sent: 2, skipped: 0, failed: 0, retryLater: 0 },
      });
      expect(sent).toHaveLength(2);
      expect(await run(notificationsDispatch, society.id, at('2026-11-10', '09:07:00'), { email: transport })).toEqual({
        status: 'SKIPPED_ALREADY_RAN',
      });
      expect(await run(notificationsDispatch, society.id, new Date(now.getTime() + 10 * 60_000), { email: transport })).toMatchObject({
        result: { sent: 0 },
      });
      expect(await ctx.prisma.notificationLog.count({ where: { societyId: society.id, status: 'SENT' } })).toBe(2);
    });

    it('records SKIPPED when no email provider is configured', async () => {
      const society = await createSociety(ctx, 'Dispatch senza provider ASD');
      await athleteWithCertificate(society.id, '2026-11-20');
      await run(certificateReminders, society.id, at('2026-11-10'));
      const outcome = await run(notificationsDispatch, society.id, at('2026-11-10', '09:00:00'));
      expect(outcome).toMatchObject({ status: 'SUCCESS', result: { sent: 0, skipped: 2 } });
      expect(await ctx.prisma.notificationLog.count({ where: { societyId: society.id, status: 'SKIPPED' } })).toBe(2);
    });

    it('uses the configured retry limit', async () => {
      const society = await createSociety(ctx, 'Dispatch retry ASD');
      await athleteWithCertificate(society.id, '2026-11-20');
      await run(certificateReminders, society.id, at('2026-11-10'));
      await ctx.prisma.automation.create({
        data: { societyId: society.id, key: 'notifications-dispatch', enabled: true, config: { maxAttempts: 1, batchSize: 1 } },
      });
      const failing: EmailTransport = { provider: 'test', send: async () => ({ ok: false, error: 'down', retryable: true }) };
      // batchSize 1 handles a single email per run; with one attempt allowed it fails for good
      expect(await run(notificationsDispatch, society.id, at('2026-11-10', '09:00:00'), { email: failing })).toMatchObject({
        result: { failed: 1, retryLater: 0 },
      });
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, status: 'FAILED' } })).toBe(1);
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, channel: 'EMAIL', status: 'PENDING' } })).toBe(1);
    });
  });

  describe('convocation-dispatch (SPEC 04)', () => {
    // A match on Saturday 14 November at 20:30 (Rome) with one unsent convocation for an athlete and a guardian.
    async function matchWithConvocation(societyId: string) {
      const athleteActor = await createActor(ctx, societyId, 'ATLETA');
      const guardianActor = await createActor(ctx, societyId, 'GENITORE');
      const member = await createMember(ctx, societyId, { userId: athleteActor.user.id });
      await ctx.prisma.guardianLink.create({ data: { societyId, guardianUserId: guardianActor.user.id, memberId: member.id } });
      const event = await ctx.prisma.event.create({
        data: { societyId, type: 'MATCH', title: 'Aquile Volley vs Delfini Volley', startsAt: at('2026-11-14', '19:30:00') },
      });
      const convocation = await ctx.prisma.convocation.create({ data: { societyId, eventId: event.id, memberId: member.id } });
      return { event, convocation, athleteActor, guardianActor };
    }

    it('sends the convocations when the event is within the configured days, once', async () => {
      const society = await createSociety(ctx, 'Convocazioni ASD');
      const { event, convocation, athleteActor, guardianActor } = await matchWithConvocation(society.id);

      // 5 days before: default is 3, nothing yet
      expect(await run(convocationDispatch, society.id, at('2026-11-09', '09:00:00'))).toMatchObject({
        status: 'SUCCESS',
        result: { eventsDispatched: 0, convocationsSent: 0, notifications: 0 },
      });

      // 3 days before: sent to the athlete and the guardian
      expect(await run(convocationDispatch, society.id, at('2026-11-11', '09:00:00'))).toMatchObject({
        result: { eventsDispatched: 1, convocationsSent: 1, remindersSent: 0, notifications: 4 },
      });
      const sent = await ctx.prisma.notification.findMany({ where: { societyId: society.id, channel: 'IN_APP', type: 'CONVOCATION' } });
      expect(sent.map((row) => row.userId).sort()).toEqual([athleteActor.user.id, guardianActor.user.id].sort());
      expect(sent[0]).toMatchObject({ title: 'Convocazione', body: expect.stringContaining('conferma presenza') });
      expect((await ctx.prisma.convocation.findUniqueOrThrow({ where: { id: convocation.id } })).sentAt).not.toBeNull();
      expect((await ctx.prisma.event.findUniqueOrThrow({ where: { id: event.id } })).convocationsSentAt).not.toBeNull();

      // the next day nothing is sent again, and it is too early for the reminder (1 day before by default)
      expect(await run(convocationDispatch, society.id, at('2026-11-12', '09:00:00'))).toMatchObject({
        result: { eventsDispatched: 0, convocationsSent: 0, remindersSent: 0, notifications: 0 },
      });
    });

    it('reminds only the athletes who have not answered, once a day, in the last days', async () => {
      const society = await createSociety(ctx, 'Promemoria convocazioni ASD');
      const first = await matchWithConvocation(society.id);
      await run(convocationDispatch, society.id, at('2026-11-11', '09:00:00'));

      expect(await run(convocationDispatch, society.id, at('2026-11-13', '09:00:00'))).toMatchObject({
        result: { convocationsSent: 0, remindersSent: 1, notifications: 4 },
      });
      expect(await run(convocationDispatch, society.id, at('2026-11-13', '09:00:00'), { runKey: 'again' })).toMatchObject({
        result: { remindersSent: 0, notifications: 0 },
      });
      const reminders = await ctx.prisma.notification.count({ where: { societyId: society.id, channel: 'IN_APP', title: 'Promemoria convocazione' } });
      expect(reminders).toBe(2);

      // once the athlete answered, there is nobody left to remind
      await ctx.prisma.convocation.update({ where: { id: first.convocation.id }, data: { status: 'CONFIRMED', respondedAt: new Date() } });
      expect(await run(convocationDispatch, society.id, at('2026-11-14', '09:00:00'))).toMatchObject({
        result: { remindersSent: 0, notifications: 0 },
      });
    });

    it('does not remind the same day the convocations go out, and honours the settings', async () => {
      const society = await createSociety(ctx, 'Impostazioni convocazioni ASD');
      await matchWithConvocation(society.id);
      await ctx.prisma.automation.create({
        data: { societyId: society.id, key: 'convocation-dispatch', enabled: true, config: { daysBefore: 1, reminderDaysBefore: 1 } },
      });
      expect(await run(convocationDispatch, society.id, at('2026-11-13', '20:00:00'))).toMatchObject({
        result: { convocationsSent: 1, remindersSent: 0, notifications: 4 },
      });
      await ctx.prisma.automation.updateMany({ where: { societyId: society.id }, data: { config: { remindNonRespondents: false } } });
      expect(await run(convocationDispatch, society.id, at('2026-11-14', '09:00:00'))).toMatchObject({
        result: { remindersSent: 0, notifications: 0 },
      });
    });

    it('skips cancelled and past events, other societies and the switched-off automation', async () => {
      const society = await createSociety(ctx, 'Annullate ASD');
      const other = await createSociety(ctx, 'Altra ASD');
      const cancelled = await matchWithConvocation(society.id);
      await ctx.prisma.event.update({ where: { id: cancelled.event.id }, data: { status: 'CANCELLED' } });
      await matchWithConvocation(other.id);

      expect(await run(convocationDispatch, society.id, at('2026-11-12', '09:00:00'))).toMatchObject({
        result: { eventsDispatched: 0, notifications: 0 },
      });
      expect(await ctx.prisma.notification.count({ where: { societyId: other.id } })).toBe(0);
      // after the match has started nothing goes out
      expect(await run(convocationDispatch, other.id, at('2026-11-15', '09:00:00'))).toMatchObject({ result: { eventsDispatched: 0 } });

      await ctx.prisma.automation.updateMany({ where: { societyId: other.id, key: 'convocation-dispatch' }, data: { enabled: false } });
      expect(await run(convocationDispatch, other.id, at('2026-11-12', '09:00:00'))).toEqual({ status: 'SKIPPED_DISABLED' });
    });
  });

  it('keeps the reminder jobs in the built-in list with valid, unique keys', () => {
    const keys = builtInAutomations.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['certificate-reminders', 'fee-reminders', 'convocation-dispatch', 'notifications-dispatch', 'housekeeping']));
  });
});
