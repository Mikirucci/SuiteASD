import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { isUniqueViolation } from '../lib/prisma-errors.js';
import { scopeToTenant, type TenantDb } from '../lib/tenant.js';
import { defaultRunKey, type AutomationDefinition } from './registry.js';

// A RUNNING row older than this is considered a crashed run and may be taken over.
export const STALE_RUN_MS = 60 * 60 * 1000;

export type RunOutcome =
  | { status: 'SUCCESS'; runId: string; result: Prisma.InputJsonObject }
  | { status: 'FAILED'; runId: string; error: string }
  | { status: 'SKIPPED_DISABLED' }
  | { status: 'SKIPPED_ALREADY_RAN' };

export interface RunAutomationInput {
  prisma: PrismaClient;
  definition: AutomationDefinition;
  societyId: string;
  now: Date;
  log: FastifyBaseLogger;
}

function isJsonObject(value: unknown): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function ensureAutomation(db: TenantDb, societyId: string, definition: AutomationDefinition) {
  const existing = await db.automation.findFirst({ where: { key: definition.key } });
  if (existing) return existing;
  try {
    return await db.automation.create({
      data: {
        societyId,
        key: definition.key,
        enabled: definition.enabledByDefault,
        config: definition.defaultConfig ?? {},
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return db.automation.findFirstOrThrow({ where: { key: definition.key } });
  }
}

// Claims the (automation, runKey) slot. The unique constraint decides the winner when two workers race.
async function claimRun(db: TenantDb, societyId: string, automationId: string, runKey: string, now: Date) {
  try {
    return await db.automationRun.create({
      data: { societyId, automationId, runKey, status: 'RUNNING', startedAt: now },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const previous = await db.automationRun.findFirst({ where: { automationId, runKey } });
  if (!previous) return null;
  // Failed runs and crashed (stale RUNNING) runs can be retried; the conditional update lets only one retry win.
  const reclaimed = await db.automationRun.updateMany({
    where: {
      id: previous.id,
      OR: [
        { status: 'FAILED' },
        { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
      ],
    },
    data: { status: 'RUNNING', startedAt: now, finishedAt: null, error: null },
  });
  return reclaimed.count === 1 ? previous : null;
}

export async function runAutomation(input: RunAutomationInput): Promise<RunOutcome> {
  const { prisma, definition, societyId, now, log } = input;
  const db = scopeToTenant(prisma, societyId);

  const automation = await ensureAutomation(db, societyId, definition);
  if (!automation.enabled) return { status: 'SKIPPED_DISABLED' };

  const runKey = (definition.runKey ?? defaultRunKey)(now);
  const run = await claimRun(db, societyId, automation.id, runKey, now);
  if (!run) return { status: 'SKIPPED_ALREADY_RAN' };

  const runLog = log.child({ automation: definition.key, societyId, runKey });
  try {
    const result = await definition.run({
      societyId,
      db,
      config: isJsonObject(automation.config) ? automation.config : {},
      now,
      runKey,
      log: runLog,
    });
    await db.automationRun.update({
      where: { id: run.id },
      data: { status: 'SUCCESS', finishedAt: new Date(), result },
    });
    await db.automation.update({ where: { id: automation.id }, data: { lastRunAt: now } });
    return { status: 'SUCCESS', runId: run.id, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runLog.error({ err: error }, 'automation run failed');
    await db.automationRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: message.slice(0, 1000) },
    });
    return { status: 'FAILED', runId: run.id, error: message };
  }
}
