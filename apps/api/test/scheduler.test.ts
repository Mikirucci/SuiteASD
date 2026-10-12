import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { housekeeping } from '../src/jobs/definitions/housekeeping.js';
import { AutomationRegistry, type AutomationDefinition } from '../src/jobs/registry.js';
import { STALE_RUN_MS, runAutomation } from '../src/jobs/runner.js';
import { createScheduler } from '../src/jobs/scheduler.js';
import { createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety } from './helpers/factories.js';

describe('automation framework', () => {
  let ctx: TestContext;
  const NOW = new Date('2026-11-14T03:30:00.000Z');

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const run = (definition: AutomationDefinition, societyId: string, now = NOW) =>
    runAutomation({ prisma: ctx.prisma, definition, societyId, now, log: ctx.app.log });

  const counter = (key: string, overrides: Partial<AutomationDefinition> = {}) => {
    const calls: string[] = [];
    const definition: AutomationDefinition = {
      key,
      name: key,
      description: 'test automation',
      schedule: '0 * * * *',
      enabledByDefault: true,
      run: async ({ societyId, runKey }) => {
        calls.push(`${societyId}:${runKey}`);
        return { executed: calls.length };
      },
      ...overrides,
    };
    return { definition, calls };
  };

  describe('registry', () => {
    it('rejects duplicate keys and invalid cron expressions', () => {
      const registry = new AutomationRegistry();
      const { definition } = counter('dup');
      registry.register(definition);
      expect(() => registry.register(definition)).toThrow(/already registered/);
      expect(() => registry.register({ ...definition, key: 'bad-cron', schedule: 'not a cron' })).toThrow(/invalid cron/);
      expect(registry.list().map((item) => item.key)).toEqual(['dup']);
    });
  });

  describe('execution and idempotency', () => {
    it('runs once, logs the run and stores the result', async () => {
      const society = await createSociety(ctx, 'Jobs ASD');
      const { definition, calls } = counter('once');
      const outcome = await run(definition, society.id);
      expect(outcome).toMatchObject({ status: 'SUCCESS', result: { executed: 1 } });
      expect(calls).toEqual([`${society.id}:2026-11-14`]);

      const stored = await ctx.prisma.automationRun.findFirstOrThrow({ where: { societyId: society.id } });
      expect(stored).toMatchObject({ status: 'SUCCESS', runKey: '2026-11-14', result: { executed: 1 } });
      expect(stored.finishedAt).not.toBeNull();
      const automation = await ctx.prisma.automation.findFirstOrThrow({ where: { societyId: society.id, key: 'once' } });
      expect(automation.lastRunAt?.toISOString()).toBe(NOW.toISOString());
    });

    it('does not run twice for the same run key, but runs again for the next one', async () => {
      const society = await createSociety(ctx, 'Idempotent ASD');
      const { definition, calls } = counter('idempotent');
      await run(definition, society.id);
      expect(await run(definition, society.id)).toEqual({ status: 'SKIPPED_ALREADY_RAN' });
      expect(calls).toHaveLength(1);
      expect(await run(definition, society.id, new Date('2026-11-15T03:30:00.000Z'))).toMatchObject({ status: 'SUCCESS' });
      expect(calls).toHaveLength(2);
    });

    it('only lets one of two concurrent workers execute the run', async () => {
      const society = await createSociety(ctx, 'Concurrent ASD');
      const { definition, calls } = counter('concurrent', {
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {};
        },
      });
      const wrapped: AutomationDefinition = { ...definition, run: async (context) => { calls.push('x'); return definition.run(context); } };
      const outcomes = await Promise.all([run(wrapped, society.id), run(wrapped, society.id)]);
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['SKIPPED_ALREADY_RAN', 'SUCCESS']);
      expect(calls).toHaveLength(1);
    });

    it('honours a custom run key', async () => {
      const society = await createSociety(ctx, 'Hourly ASD');
      const { definition, calls } = counter('hourly', { runKey: (now) => now.toISOString().slice(0, 13) });
      await run(definition, society.id, new Date('2026-11-14T10:05:00.000Z'));
      await run(definition, society.id, new Date('2026-11-14T10:55:00.000Z'));
      await run(definition, society.id, new Date('2026-11-14T11:05:00.000Z'));
      expect(calls.map((call) => call.split(':')[1])).toEqual(['2026-11-14T10', '2026-11-14T11']);
    });
  });

  describe('failure handling', () => {
    it('records a failure with its message and retries it on the next tick', async () => {
      const society = await createSociety(ctx, 'Flaky ASD');
      let attempts = 0;
      const { definition } = counter('flaky', {
        run: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('smtp down');
          return { attempts };
        },
      });
      expect(await run(definition, society.id)).toMatchObject({ status: 'FAILED', error: 'smtp down' });
      const failed = await ctx.prisma.automationRun.findFirstOrThrow({ where: { societyId: society.id } });
      expect(failed).toMatchObject({ status: 'FAILED', error: 'smtp down' });

      expect(await run(definition, society.id)).toMatchObject({ status: 'SUCCESS', result: { attempts: 2 } });
      const rows = await ctx.prisma.automationRun.findMany({ where: { societyId: society.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'SUCCESS', error: null });
    });

    it('takes over a crashed (stale RUNNING) run but never a live one', async () => {
      const society = await createSociety(ctx, 'Crash ASD');
      const { definition, calls } = counter('crashy');
      await run(definition, society.id); // creates Automation + run, then we simulate a crash
      const stored = await ctx.prisma.automationRun.findFirstOrThrow({ where: { societyId: society.id } });

      await ctx.prisma.automationRun.update({ where: { id: stored.id }, data: { status: 'RUNNING', startedAt: NOW } });
      expect(await run(definition, society.id)).toEqual({ status: 'SKIPPED_ALREADY_RAN' });

      await ctx.prisma.automationRun.update({
        where: { id: stored.id },
        data: { startedAt: new Date(NOW.getTime() - STALE_RUN_MS - 1000) },
      });
      expect(await run(definition, society.id)).toMatchObject({ status: 'SUCCESS' });
      expect(calls).toHaveLength(2);
    });
  });

  describe('per-society settings', () => {
    it('skips a disabled automation and creates it disabled when disabled by default', async () => {
      const society = await createSociety(ctx, 'Optional ASD');
      const { definition, calls } = counter('optional', { enabledByDefault: false });
      expect(await run(definition, society.id)).toEqual({ status: 'SKIPPED_DISABLED' });
      expect(calls).toHaveLength(0);

      await ctx.prisma.automation.updateMany({ where: { societyId: society.id, key: 'optional' }, data: { enabled: true } });
      expect(await run(definition, society.id)).toMatchObject({ status: 'SUCCESS' });
    });

    it('passes the stored configuration to the job, falling back to the defaults', async () => {
      const society = await createSociety(ctx, 'Configurable ASD');
      const seen: unknown[] = [];
      const { definition } = counter('configurable', {
        defaultConfig: { thresholds: [30, 15, 7] },
        run: async ({ config }) => {
          seen.push(config);
          return {};
        },
      });
      await run(definition, society.id);
      await ctx.prisma.automation.updateMany({
        where: { societyId: society.id, key: 'configurable' },
        data: { config: { thresholds: [10] } },
      });
      await run(definition, society.id, new Date('2026-11-15T03:30:00.000Z'));
      expect(seen).toEqual([{ thresholds: [30, 15, 7] }, { thresholds: [10] }]);
    });

    it('hands the job a client that is limited to its own society', async () => {
      const mine = await createSociety(ctx, 'Scoped job ASD');
      const other = await createSociety(ctx, 'Not mine ASD');
      await ctx.prisma.team.create({ data: { societyId: other.id, name: 'Invisible' } });
      let visible = -1;
      const { definition } = counter('scoped', {
        run: async ({ db }) => {
          visible = await db.team.count();
          return {};
        },
      });
      await run(definition, mine.id);
      expect(visible).toBe(0);
    });
  });

  describe('scheduler', () => {
    it('runs an automation for every society and survives a failing one', async () => {
      const registry = new AutomationRegistry();
      const calls: string[] = [];
      registry.register({
        key: 'fan-out',
        name: 'fan-out',
        description: 'runs for all societies',
        schedule: '*/5 * * * *',
        enabledByDefault: true,
        run: async ({ societyId, db }) => {
          const society = await db.society.findFirstOrThrow();
          if (society.name === 'Exploding ASD') throw new Error('boom');
          calls.push(societyId);
          return {};
        },
      });
      const fine = await createSociety(ctx, 'Fine ASD');
      const exploding = await createSociety(ctx, 'Exploding ASD');
      const scheduler = createScheduler({ prisma: ctx.prisma, log: ctx.app.log, registry });

      const outcomes = await scheduler.runForAllSocieties('fan-out', NOW);
      expect(outcomes.get(fine.id)).toMatchObject({ status: 'SUCCESS' });
      expect(outcomes.get(exploding.id)).toMatchObject({ status: 'FAILED', error: 'boom' });
      expect(calls).toContain(fine.id);
      await expect(scheduler.runForAllSocieties('unknown')).rejects.toThrow(/Unknown automation/);
    });

    it('starts and stops cron tasks without leaking timers', () => {
      const registry = new AutomationRegistry();
      registry.register(counter('cron-start').definition);
      const scheduler = createScheduler({ prisma: ctx.prisma, log: ctx.app.log, registry });
      scheduler.start();
      scheduler.stop();
    });
  });

  describe('housekeeping (example automation)', () => {
    it('deletes expired refresh tokens and long-expired invitations of its own society only', async () => {
      const society = await createSociety(ctx, 'Clean ASD');
      const other = await createSociety(ctx, 'Dirty ASD');
      const admin = await createActor(ctx, society.id, 'ADMIN');
      const day = 24 * 60 * 60 * 1000;
      const token = (societyId: string, userId: string, name: string, expiresAt: Date) =>
        ctx.prisma.refreshToken.create({ data: { societyId, userId, familyId: name, tokenHash: name, expiresAt } });
      await token(society.id, admin.user.id, 'expired', new Date(NOW.getTime() - day));
      await token(society.id, admin.user.id, 'valid', new Date(NOW.getTime() + day));
      await token(other.id, admin.user.id, 'foreign-expired', new Date(NOW.getTime() - day));
      const invite = (societyId: string, email: string, expiresAt: Date) =>
        ctx.prisma.invitation.create({
          data: { societyId, email, role: 'STAFF', tokenHash: email, invitedById: admin.user.id, expiresAt },
        });
      await invite(society.id, 'old@example.test', new Date(NOW.getTime() - 40 * day));
      await invite(society.id, 'recent@example.test', new Date(NOW.getTime() - 2 * day));

      const outcome = await run(housekeeping, society.id);
      expect(outcome).toMatchObject({ status: 'SUCCESS', result: { refreshTokensDeleted: 1, invitationsDeleted: 1 } });
      const remainingTokens = await ctx.prisma.refreshToken.findMany({ where: { tokenHash: { in: ['expired', 'valid', 'foreign-expired'] } } });
      expect(remainingTokens.map((row) => row.tokenHash).sort()).toEqual(['foreign-expired', 'valid']);
      const remainingInvites = await ctx.prisma.invitation.findMany({ where: { societyId: society.id } });
      expect(remainingInvites.map((row) => row.email)).toEqual(['recent@example.test']);
    });
  });
});
