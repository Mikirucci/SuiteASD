import type { Automation, Prisma } from '@prisma/client';
import { isUniqueViolation } from '../lib/prisma-errors.js';
import { catalogEntryFor } from './catalog.js';

// Support for event-driven automations (kind EVENT): there is no schedule, the code performing the action asks
// `isAutomationEnabled` first and records what it did with `logEventRun`, so the dashboard shows it like any other.

// The slices of a tenant client (or of a transaction) these helpers use.
export interface AutomationReader {
  automation: { findFirst(args: { where: { key: string } }): PromiseLike<Automation | null> };
}

export interface AutomationStore {
  automation: AutomationReader['automation'] & {
    create(args: { data: Prisma.AutomationUncheckedCreateInput }): PromiseLike<Automation>;
    update(args: { where: { id: string }; data: { lastRunAt: Date } }): PromiseLike<Automation>;
  };
  automationRun: {
    create(args: { data: Prisma.AutomationRunUncheckedCreateInput }): PromiseLike<unknown>;
  };
}

function catalogEntryOrThrow(key: string) {
  const entry = catalogEntryFor(key);
  if (!entry) throw new Error(`Unknown automation "${key}"`);
  return entry;
}

// A society that never touched the dashboard has no row yet: the catalog default (enabled) applies.
export async function isAutomationEnabled(db: AutomationReader, key: string): Promise<boolean> {
  catalogEntryOrThrow(key);
  const row = await db.automation.findFirst({ where: { key } });
  return row?.enabled ?? true;
}

export async function ensureAutomationRow(db: AutomationStore, societyId: string, key: string) {
  const existing = await db.automation.findFirst({ where: { key } });
  if (existing) return existing;
  try {
    return await db.automation.create({
      data: { societyId, key, enabled: true, config: catalogEntryOrThrow(key).defaultConfig },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await db.automation.findFirst({ where: { key } });
    if (!winner) throw error;
    return winner;
  }
}

// Adds one SUCCESS row to the automation's execution log (runKey must be unique per action, e.g. "receipt:<id>").
export async function logEventRun(
  db: AutomationStore,
  input: { societyId: string; key: string; runKey: string; result: Prisma.InputJsonObject; now: Date },
): Promise<void> {
  const automation = await ensureAutomationRow(db, input.societyId, input.key);
  await db.automationRun.create({
    data: {
      societyId: input.societyId,
      automationId: automation.id,
      runKey: input.runKey,
      status: 'SUCCESS',
      startedAt: input.now,
      finishedAt: input.now,
      result: input.result,
    },
  });
  await db.automation.update({ where: { id: automation.id }, data: { lastRunAt: input.now } });
}
