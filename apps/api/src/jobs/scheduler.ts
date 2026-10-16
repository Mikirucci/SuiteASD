import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import cron, { type ScheduledTask } from 'node-cron';
import type { EmailTransport } from '../lib/email.js';
import { automationRegistry, type AutomationDefinition, type AutomationRegistry } from './registry.js';
import { runAutomation, isJsonObject, type RunOutcome } from './runner.js';
import { SCHEDULER_TIMEZONE, isDailyRunDue } from './schedule.js';

// Cron of an automation whose hour is configurable per society: it ticks every hour and `runDueSocieties` decides.
const HOURLY_TICK = '0 * * * *';

export interface SchedulerOptions {
  prisma: PrismaClient;
  log: FastifyBaseLogger;
  registry?: AutomationRegistry;
  email?: EmailTransport | null;
}

export interface Scheduler {
  // Starts one cron task per registered automation (in-process, no Redis).
  start(): void;
  stop(): void;
  // Runs an automation for every society now, whatever their configured hour. Also used by tests and by manual triggers.
  runForAllSocieties(key: string, now?: Date): Promise<Map<string, RunOutcome>>;
  // What a cron tick does: runs the automation for the societies it is due for at `now`. An automation with a
  // configurable hour is due from that hour (Europe/Rome) and, if a tick was missed, for the next few hours of the
  // same day; the run key keeps it to one successful run per day. Any other automation is due for everybody.
  runDueSocieties(key: string, now?: Date): Promise<Map<string, RunOutcome>>;
}

export function createScheduler({ prisma, log, registry = automationRegistry, email = null }: SchedulerOptions): Scheduler {
  const tasks: ScheduledTask[] = [];

  function definitionOf(key: string): AutomationDefinition {
    const definition = registry.get(key);
    if (!definition) throw new Error(`Unknown automation "${key}"`);
    return definition;
  }

  async function runFor(definition: AutomationDefinition, societyIds: readonly string[], now: Date) {
    const outcomes = new Map<string, RunOutcome>();
    for (const societyId of societyIds) {
      // One society failing must not stop the others.
      try {
        outcomes.set(societyId, await runAutomation({ prisma, definition, societyId, now, log, email }));
      } catch (error) {
        log.error({ err: error, automation: definition.key, societyId }, 'automation could not be executed');
      }
    }
    return outcomes;
  }

  async function allSocietyIds(): Promise<string[]> {
    return (await prisma.society.findMany({ select: { id: true } })).map((society) => society.id);
  }

  async function runForAllSocieties(key: string, now: Date = new Date()): Promise<Map<string, RunOutcome>> {
    return runFor(definitionOf(key), await allSocietyIds(), now);
  }

  async function runDueSocieties(key: string, now: Date = new Date()): Promise<Map<string, RunOutcome>> {
    const definition = definitionOf(key);
    const { hourOf } = definition;
    const societyIds = await allSocietyIds();
    if (!hourOf) return runFor(definition, societyIds, now);

    // A society that never saved its settings has no row: its hour is the default one.
    const rows = await prisma.automation.findMany({ where: { key }, select: { societyId: true, config: true } });
    const configs = new Map(rows.map((row) => [row.societyId, isJsonObject(row.config) ? row.config : {}]));
    const due = societyIds.filter((societyId) => isDailyRunDue(hourOf(configs.get(societyId) ?? {}), now));
    return runFor(definition, due, now);
  }

  return {
    start() {
      for (const definition of registry.list()) {
        tasks.push(
          cron.schedule(
            definition.hourOf ? HOURLY_TICK : definition.schedule,
            () => {
              runDueSocieties(definition.key).catch((error: unknown) => {
                log.error({ err: error, automation: definition.key }, 'scheduled automation failed');
              });
            },
            { timezone: SCHEDULER_TIMEZONE },
          ),
        );
      }
      log.info({ automations: registry.list().map((definition) => definition.key) }, 'scheduler started');
    },
    stop() {
      for (const task of tasks) void task.destroy();
      tasks.length = 0;
    },
    runForAllSocieties,
    runDueSocieties,
  };
}
