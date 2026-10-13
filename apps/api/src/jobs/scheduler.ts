import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import cron, { type ScheduledTask } from 'node-cron';
import type { EmailTransport } from '../lib/email.js';
import { automationRegistry, type AutomationRegistry } from './registry.js';
import { runAutomation, type RunOutcome } from './runner.js';

const TIMEZONE = 'Europe/Rome';

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
  // Runs an automation for every society now (what the cron tick does). Also used by tests and by manual triggers.
  runForAllSocieties(key: string, now?: Date): Promise<Map<string, RunOutcome>>;
}

export function createScheduler({ prisma, log, registry = automationRegistry, email = null }: SchedulerOptions): Scheduler {
  const tasks: ScheduledTask[] = [];

  async function runForAllSocieties(key: string, now: Date = new Date()): Promise<Map<string, RunOutcome>> {
    const definition = registry.get(key);
    if (!definition) throw new Error(`Unknown automation "${key}"`);
    const societies = await prisma.society.findMany({ select: { id: true } });
    const outcomes = new Map<string, RunOutcome>();
    for (const society of societies) {
      // One society failing must not stop the others.
      try {
        outcomes.set(society.id, await runAutomation({ prisma, definition, societyId: society.id, now, log, email }));
      } catch (error) {
        log.error({ err: error, automation: key, societyId: society.id }, 'automation could not be executed');
      }
    }
    return outcomes;
  }

  return {
    start() {
      for (const definition of registry.list()) {
        tasks.push(
          cron.schedule(
            definition.schedule,
            () => {
              runForAllSocieties(definition.key).catch((error: unknown) => {
                log.error({ err: error, automation: definition.key }, 'scheduled automation failed');
              });
            },
            { timezone: TIMEZONE },
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
  };
}
