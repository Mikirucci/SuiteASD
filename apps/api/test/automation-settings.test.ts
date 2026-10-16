import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { certificateReminders } from '../src/jobs/definitions/certificate-reminders.js';
import { convocationDispatch } from '../src/jobs/definitions/convocation-dispatch.js';
import { feeReminders } from '../src/jobs/definitions/fee-reminders.js';
import { builtInAutomations } from '../src/jobs/definitions/index.js';
import { AutomationRegistry, type AutomationDefinition } from '../src/jobs/registry.js';
import { runAutomation } from '../src/jobs/runner.js';
import { CATCH_UP_HOURS, dailyCron, isDailyRunDue, localClock, localDayRunKey } from '../src/jobs/schedule.js';
import { createScheduler } from '../src/jobs/scheduler.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, type Actor } from './helpers/factories.js';

const at = (date: string, time: string) => new Date(`${date}T${time}.000Z`);
const DAY_MS = 86_400_000;

describe('daily schedule helpers (unit)', () => {
  it('reads the Europe/Rome wall clock, with and without daylight saving time', () => {
    expect(localClock(at('2026-11-14', '08:00:00'))).toEqual({ date: '2026-11-14', hour: 9 });
    expect(localClock(at('2026-07-01', '07:00:00'))).toEqual({ date: '2026-07-01', hour: 9 });
    expect(localClock(at('2026-11-14', '23:30:00'))).toEqual({ date: '2026-11-15', hour: 0 });
    expect(localClock(at('2026-07-01', '22:30:00'))).toEqual({ date: '2026-07-02', hour: 0 });
  });

  it('buckets a day by the local calendar date', () => {
    expect(localDayRunKey(at('2026-11-14', '22:59:00'))).toBe('2026-11-14');
    expect(localDayRunKey(at('2026-11-14', '23:00:00'))).toBe('2026-11-15');
  });

  it('writes the hour as a daily cron expression', () => {
    expect(dailyCron(0)).toBe('0 0 * * *');
    expect(dailyCron(14)).toBe('0 14 * * *');
  });

  it('is due from the configured hour for the catch-up window, never before and never across midnight', () => {
    const tick = (utcTime: string) => at('2026-11-14', utcTime); // Rome = UTC + 1 in November
    expect([7, 8, 9, 10, 11].map((utcHour) => isDailyRunDue(9, tick(`${String(utcHour).padStart(2, '0')}:30:00`)))).toEqual([
      false, // 08:30 Rome
      true, // 09:30
      true, // 10:30
      true, // 11:30
      false, // 12:30
    ]);
    expect(CATCH_UP_HOURS).toBe(3);
    expect(isDailyRunDue(23, at('2026-11-14', '22:30:00'))).toBe(true);
    expect(isDailyRunDue(23, at('2026-11-14', '23:30:00'))).toBe(false); // 00:30 of the next day
  });
});

describe('per-society hour and channels of the daily automations (SPEC 08)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const registry = new AutomationRegistry();
  for (const definition of builtInAutomations) registry.register(definition);
  const scheduler = () => createScheduler({ prisma: ctx.prisma, log: ctx.app.log, registry });

  const patch = (admin: Actor, key: string, payload: object) =>
    ctx.app.inject({ method: 'PATCH', url: `${API}/automations/${key}`, headers: admin.headers, payload });
  const dashboard = async (admin: Actor) => {
    const body = (await ctx.app.inject({ method: 'GET', url: `${API}/automations`, headers: admin.headers })).json();
    return Object.fromEntries(body.data.map((item: { key: string }) => [item.key, item]));
  };
  const newSociety = async (name: string) => {
    const society = await createSociety(ctx, name);
    return { society, admin: await createActor(ctx, society.id, 'ADMIN') };
  };

  describe('configuration', () => {
    it('stores hour and channels, merges them with the other settings and normalises the channel list', async () => {
      const { admin } = await newSociety('Impostazioni ASD');
      const response = await patch(admin, 'fee-reminders', { config: { hour: 14, channels: ['EMAIL', 'IN_APP', 'EMAIL'] } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        schedule: '0 14 * * *',
        config: { hour: 14, channels: ['IN_APP', 'EMAIL'], beforeDueDays: [1, 7], afterDueDays: [3, 10] },
      });

      const channelsOnly = await patch(admin, 'fee-reminders', { config: { channels: ['EMAIL'] } });
      expect(channelsOnly.json()).toMatchObject({ schedule: '0 14 * * *', config: { hour: 14, channels: ['EMAIL'] } });
      const hourOnly = await patch(admin, 'fee-reminders', { config: { hour: 0 } });
      expect(hourOnly.json()).toMatchObject({ schedule: '0 0 * * *', config: { hour: 0, channels: ['EMAIL'] } });
    });

    it('reports the schedule that matches the stored hour, per society, and keeps the fixed one fixed', async () => {
      const first = await newSociety('Orario prima ASD');
      const second = await newSociety('Orario seconda ASD');
      await patch(first.admin, 'certificate-reminders', { config: { hour: 6 } });
      await patch(first.admin, 'convocation-dispatch', { config: { hour: 21 } });

      const mine = await dashboard(first.admin);
      expect(mine['certificate-reminders']).toMatchObject({ schedule: '0 6 * * *', config: { hour: 6 } });
      expect(mine['convocation-dispatch']).toMatchObject({ schedule: '0 21 * * *', config: { hour: 21 } });
      expect(mine['fee-reminders']).toMatchObject({ schedule: '0 9 * * *', config: { hour: 9 } });
      expect(mine['notifications-dispatch'].schedule).toBe('*/10 * * * *');
      expect(mine['notifications-dispatch'].config).toEqual({ maxAttempts: 3, batchSize: 100 });

      const theirs = await dashboard(second.admin);
      expect(theirs['certificate-reminders']).toMatchObject({ schedule: '0 8 * * *', config: { hour: 8 } });
      expect(theirs['convocation-dispatch']).toMatchObject({ schedule: '0 9 * * *', config: { hour: 9 } });
    });

    it('keeps working for a society whose stored settings predate hour and channels', async () => {
      const { society, admin } = await newSociety('Impostazioni vecchie ASD');
      await ctx.prisma.automation.create({
        data: { societyId: society.id, key: 'certificate-reminders', enabled: true, config: { thresholdsDays: [7] } },
      });
      expect((await dashboard(admin))['certificate-reminders']).toMatchObject({
        schedule: '0 8 * * *',
        config: { thresholdsDays: [7], hour: 8, channels: ['IN_APP', 'EMAIL'] },
      });
      const outcomes = await scheduler().runDueSocieties('certificate-reminders', at('2026-11-14', '07:00:00'));
      expect(outcomes.get(society.id)).toMatchObject({ status: 'SUCCESS' });
    });
  });

  describe('scheduler honours the hour of each society', () => {
    it('runs the automation only for the societies whose hour has come', async () => {
      const early = await newSociety('Mattina ASD');
      const late = await newSociety('Pomeriggio ASD');
      await patch(late.admin, 'fee-reminders', { config: { hour: 14 } });
      const run = (utcTime: string) => scheduler().runDueSocieties('fee-reminders', at('2026-11-14', utcTime));

      const beforeNine = await run('07:00:00'); // 08:00 in Rome
      expect(beforeNine.has(early.society.id)).toBe(false);
      expect(beforeNine.has(late.society.id)).toBe(false);

      const nine = await run('08:00:00'); // 09:00 in Rome
      expect(nine.get(early.society.id)).toMatchObject({ status: 'SUCCESS' });
      expect(nine.has(late.society.id)).toBe(false);

      const afterWindow = await run('12:00:00'); // 13:00: the default society is past its window, the other not yet due
      expect(afterWindow.has(early.society.id)).toBe(false);
      expect(afterWindow.has(late.society.id)).toBe(false);

      const two = await run('13:00:00'); // 14:00 in Rome
      expect(two.get(late.society.id)).toMatchObject({ status: 'SUCCESS' });
      expect(two.has(early.society.id)).toBe(false);

      const runs = await ctx.prisma.automationRun.findMany({
        where: { societyId: { in: [early.society.id, late.society.id] } },
        select: { societyId: true, runKey: true, startedAt: true },
      });
      expect(runs).toHaveLength(2);
      expect(runs.find((row) => row.societyId === early.society.id)?.startedAt).toEqual(at('2026-11-14', '08:00:00'));
      expect(runs.find((row) => row.societyId === late.society.id)?.startedAt).toEqual(at('2026-11-14', '13:00:00'));
    });

    it('runs once a day: later ticks of the window find the day already done, the next day runs again', async () => {
      const { society } = await newSociety('Una volta ASD');
      const run = (date: string, utcTime: string) => scheduler().runDueSocieties('fee-reminders', at(date, utcTime));

      expect((await run('2026-11-14', '08:00:00')).get(society.id)).toMatchObject({ status: 'SUCCESS' });
      expect((await run('2026-11-14', '09:00:00')).get(society.id)).toEqual({ status: 'SKIPPED_ALREADY_RAN' });
      expect((await run('2026-11-14', '10:00:00')).get(society.id)).toEqual({ status: 'SKIPPED_ALREADY_RAN' });
      expect((await run('2026-11-15', '08:00:00')).get(society.id)).toMatchObject({ status: 'SUCCESS' });
      const keys = await ctx.prisma.automationRun.findMany({ where: { societyId: society.id }, orderBy: { runKey: 'asc' } });
      expect(keys.map((row) => row.runKey)).toEqual(['2026-11-14', '2026-11-15']);
    });

    it('catches up a missed tick within the window and a failed run on the next tick', async () => {
      const { society, admin } = await newSociety('Recupero ASD');
      await patch(admin, 'fee-reminders', { config: { hour: 9 } });
      // The scheduler was down at 09:00 Rome and is back at 11:30.
      const late = await scheduler().runDueSocieties('fee-reminders', at('2026-11-14', '10:30:00'));
      expect(late.get(society.id)).toMatchObject({ status: 'SUCCESS' });

      const flaky = await newSociety('Fallimento ASD');
      // Only this society fails, and only on its first attempt: other societies due the same day are unaffected.
      let flakyAttempts = 0;
      const failing: AutomationDefinition = {
        ...feeReminders,
        key: 'fee-reminders',
        run: async ({ societyId }) => {
          if (societyId === flaky.society.id) {
            flakyAttempts += 1;
            if (flakyAttempts === 1) throw new Error('database busy');
          }
          return { recovered: true };
        },
      };
      const failingRegistry = new AutomationRegistry();
      failingRegistry.register(failing);
      const failingScheduler = createScheduler({ prisma: ctx.prisma, log: ctx.app.log, registry: failingRegistry });
      expect((await failingScheduler.runDueSocieties('fee-reminders', at('2026-11-15', '08:00:00'))).get(flaky.society.id)).toMatchObject({
        status: 'FAILED',
      });
      expect((await failingScheduler.runDueSocieties('fee-reminders', at('2026-11-15', '09:00:00'))).get(flaky.society.id)).toMatchObject({
        status: 'SUCCESS',
        result: { recovered: true },
      });
    });

    it('buckets the day by the local date, so hour 0 does not run twice around midnight UTC', async () => {
      const { society, admin } = await newSociety('Mezzanotte ASD');
      await patch(admin, 'fee-reminders', { config: { hour: 0 } });
      const run = (date: string, utcTime: string) => scheduler().runDueSocieties('fee-reminders', at(date, utcTime));

      expect((await run('2026-11-14', '23:10:00')).get(society.id)).toMatchObject({ status: 'SUCCESS' }); // 00:10 on the 15th
      expect((await run('2026-11-15', '00:10:00')).get(society.id)).toEqual({ status: 'SKIPPED_ALREADY_RAN' }); // 01:10
      const stored = await ctx.prisma.automationRun.findMany({ where: { societyId: society.id } });
      expect(stored.map((row) => row.runKey)).toEqual(['2026-11-15']);
    });

    it('does not run the late-evening hour again after midnight', async () => {
      const { society, admin } = await newSociety('Sera ASD');
      await patch(admin, 'fee-reminders', { config: { hour: 23 } });
      const evening = await scheduler().runDueSocieties('fee-reminders', at('2026-11-14', '22:30:00'));
      expect(evening.get(society.id)).toMatchObject({ status: 'SUCCESS' });
      const afterMidnight = await scheduler().runDueSocieties('fee-reminders', at('2026-11-14', '23:30:00'));
      expect(afterMidnight.has(society.id)).toBe(false);
    });

    it('still skips a switched-off automation', async () => {
      const { society, admin } = await newSociety('Spenta ASD');
      await patch(admin, 'fee-reminders', { enabled: false });
      const outcomes = await scheduler().runDueSocieties('fee-reminders', at('2026-11-14', '08:00:00'));
      expect(outcomes.get(society.id)).toEqual({ status: 'SKIPPED_DISABLED' });
    });

    it('leaves the fixed automations on their own timing: every society, at any time', async () => {
      const { society } = await newSociety('Fissa ASD');
      const outcomes = await scheduler().runDueSocieties('notifications-dispatch', at('2026-11-14', '03:17:00'));
      expect(outcomes.get(society.id)).toMatchObject({ status: 'SUCCESS' });
      const housekeepingOutcomes = await scheduler().runDueSocieties('housekeeping', at('2026-11-14', '14:00:00'));
      expect(housekeepingOutcomes.get(society.id)).toMatchObject({ status: 'SUCCESS' });
    });

    it('registers the three configurable automations with an hourly tick and the others with their own cron', () => {
      const configurable = builtInAutomations.filter((definition) => definition.hourOf).map((definition) => definition.key);
      expect(configurable.sort()).toEqual(['certificate-reminders', 'convocation-dispatch', 'fee-reminders']);
      expect(builtInAutomations.find((definition) => definition.key === 'notifications-dispatch')?.hourOf).toBeUndefined();
      expect(builtInAutomations.find((definition) => definition.key === 'notifications-dispatch')?.schedule).toBe('*/10 * * * *');
    });
  });

  describe('channels', () => {
    const countByChannel = async (societyId: string) => {
      const rows = await ctx.prisma.notification.groupBy({ by: ['channel'], where: { societyId }, _count: { _all: true } });
      return { IN_APP: rows.find((row) => row.channel === 'IN_APP')?._count._all ?? 0, EMAIL: rows.find((row) => row.channel === 'EMAIL')?._count._all ?? 0 };
    };
    const run = (definition: AutomationDefinition, societyId: string, now: Date) =>
      runAutomation({ prisma: ctx.prisma, definition, societyId, now, log: ctx.app.log });

    // An athlete with an account and a fee due on 15 November (first reminder step: 8 November).
    async function payerWithFee(societyId: string) {
      const athleteActor = await createActor(ctx, societyId, 'ATLETA');
      const member = await createMember(ctx, societyId, { userId: athleteActor.user.id });
      await ctx.prisma.payment.create({
        data: { societyId, memberId: member.id, description: 'Quota novembre', amountCents: 6000, dueDate: at('2026-11-15', '00:00:00') },
      });
      return athleteActor;
    }
    const FEE_DAY = at('2026-11-08', '08:00:00');

    it.each([
      [['IN_APP'], { IN_APP: 1, EMAIL: 0 }],
      [['EMAIL'], { IN_APP: 0, EMAIL: 1 }],
      [['IN_APP', 'EMAIL'], { IN_APP: 1, EMAIL: 1 }],
    ] as const)('fee reminders only use the channels %j', async (channels, expected) => {
      const { society, admin } = await newSociety(`Canali quote ${channels.join('-')} ASD`);
      await payerWithFee(society.id);
      expect((await patch(admin, 'fee-reminders', { config: { channels } })).statusCode).toBe(200);
      expect(await run(feeReminders, society.id, FEE_DAY)).toMatchObject({ result: { remindersSent: 1 } });
      expect(await countByChannel(society.id)).toEqual(expected);
    });

    it('defaults to every channel when the society never chose', async () => {
      const { society } = await newSociety('Canali default ASD');
      await payerWithFee(society.id);
      await run(feeReminders, society.id, FEE_DAY);
      expect(await countByChannel(society.id)).toEqual({ IN_APP: 1, EMAIL: 1 });
    });

    it("adds to the user's preferences: a channel must be allowed by both", async () => {
      const { society, admin } = await newSociety('Canali preferenze ASD');
      const athlete = await payerWithFee(society.id);
      await ctx.prisma.notificationPreference.create({
        data: { societyId: society.id, userId: athlete.user.id, type: 'FEE_DUE', channel: 'EMAIL', enabled: false },
      });

      await patch(admin, 'fee-reminders', { config: { channels: ['EMAIL'] } });
      expect(await run(feeReminders, society.id, FEE_DAY)).toMatchObject({ result: { feesChecked: 1, remindersSent: 0 } });
      expect(await countByChannel(society.id)).toEqual({ IN_APP: 0, EMAIL: 0 });

      await patch(admin, 'fee-reminders', { config: { channels: ['IN_APP', 'EMAIL'] } });
      await run(feeReminders, society.id, at('2026-11-09', '08:00:00'));
      expect(await countByChannel(society.id)).toEqual({ IN_APP: 1, EMAIL: 0 });
    });

    it('still honours the switch of the notifications dispatch: no email is queued while it is off', async () => {
      const { society, admin } = await newSociety('Canali spenti ASD');
      await payerWithFee(society.id);
      await patch(admin, 'notifications-dispatch', { enabled: false });
      await patch(admin, 'fee-reminders', { config: { channels: ['EMAIL'] } });
      expect(await run(feeReminders, society.id, FEE_DAY)).toMatchObject({ result: { remindersSent: 0 } });
      expect(await countByChannel(society.id)).toEqual({ IN_APP: 0, EMAIL: 0 });
    });

    it('certificate reminders reach athlete and guardian on the chosen channel only', async () => {
      const { society, admin } = await newSociety('Canali certificati ASD');
      const athleteActor = await createActor(ctx, society.id, 'ATLETA');
      const guardianActor = await createActor(ctx, society.id, 'GENITORE');
      const member = await createMember(ctx, society.id, { userId: athleteActor.user.id });
      await ctx.prisma.guardianLink.create({ data: { societyId: society.id, guardianUserId: guardianActor.user.id, memberId: member.id } });
      const type = await ctx.prisma.documentType.create({
        data: { societyId: society.id, key: 'MEDICAL_CERTIFICATE', name: 'Certificato medico', requiresExpiry: true },
      });
      await ctx.prisma.document.create({
        data: { societyId: society.id, memberId: member.id, documentTypeId: type.id, expiresAt: at('2026-11-30', '00:00:00') },
      });

      await patch(admin, 'certificate-reminders', { config: { channels: ['IN_APP'] } });
      expect(await run(certificateReminders, society.id, at('2026-11-10', '08:00:00'))).toMatchObject({ result: { notifications: 2 } });
      expect(await countByChannel(society.id)).toEqual({ IN_APP: 2, EMAIL: 0 });
    });

    describe('convocations', () => {
      async function matchWithConvocation(societyId: string) {
        const athleteActor = await createActor(ctx, societyId, 'ATLETA');
        const member = await createMember(ctx, societyId, { userId: athleteActor.user.id });
        const event = await ctx.prisma.event.create({
          data: { societyId, type: 'MATCH', title: 'Aquile Volley vs Delfini Volley', startsAt: at('2026-11-14', '19:30:00') },
        });
        await ctx.prisma.convocation.create({ data: { societyId, eventId: event.id, memberId: member.id } });
        return event;
      }

      it('the dispatch and its reminder only use the chosen channel', async () => {
        const { society, admin } = await newSociety('Canali convocazioni ASD');
        await matchWithConvocation(society.id);
        await patch(admin, 'convocation-dispatch', { config: { channels: ['IN_APP'] } });

        expect(await run(convocationDispatch, society.id, at('2026-11-11', '08:00:00'))).toMatchObject({
          result: { convocationsSent: 1, notifications: 1 },
        });
        expect(await countByChannel(society.id)).toEqual({ IN_APP: 1, EMAIL: 0 });

        expect(await run(convocationDispatch, society.id, at('2026-11-13', '08:00:00'))).toMatchObject({
          result: { remindersSent: 1, notifications: 1 },
        });
        expect(await countByChannel(society.id)).toEqual({ IN_APP: 2, EMAIL: 0 });
      });

      it('a coach sending by hand is not limited by the automation settings', async () => {
        const { society, admin } = await newSociety('Invio manuale ASD');
        const athleteActor = await createActor(ctx, society.id, 'ATLETA');
        const member = await createMember(ctx, society.id, { userId: athleteActor.user.id });
        const event = await ctx.prisma.event.create({
          data: { societyId: society.id, type: 'MATCH', title: 'Amichevole', startsAt: new Date(Date.now() + 30 * DAY_MS) },
        });
        await ctx.prisma.convocation.create({ data: { societyId: society.id, eventId: event.id, memberId: member.id } });
        await patch(admin, 'convocation-dispatch', { config: { channels: ['IN_APP'] } });

        const response = await ctx.app.inject({
          method: 'POST',
          url: `${API}/events/${event.id}/convocations/send`,
          headers: admin.headers,
        });
        expect(response.statusCode).toBe(200);
        expect(await countByChannel(society.id)).toEqual({ IN_APP: 1, EMAIL: 1 });
      });
    });

    it('keeps the societies apart', async () => {
      const restricted = await newSociety('Canali solo app ASD');
      const open = await newSociety('Canali aperta ASD');
      await payerWithFee(restricted.society.id);
      await payerWithFee(open.society.id);
      await patch(restricted.admin, 'fee-reminders', { config: { channels: ['IN_APP'] } });

      await run(feeReminders, restricted.society.id, FEE_DAY);
      await run(feeReminders, open.society.id, FEE_DAY);
      expect(await countByChannel(restricted.society.id)).toEqual({ IN_APP: 1, EMAIL: 0 });
      expect(await countByChannel(open.society.id)).toEqual({ IN_APP: 1, EMAIL: 1 });
      expect((await dashboard(open.admin))['fee-reminders'].config.channels).toEqual(['IN_APP', 'EMAIL']);
    });
  });
});
