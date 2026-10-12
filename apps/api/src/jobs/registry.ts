import type { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import cron from 'node-cron';
import type { TenantDb } from '../lib/tenant.js';

export interface AutomationContext {
  societyId: string;
  // Tenant-scoped client: an automation can only touch the society it is running for.
  db: TenantDb;
  // The society's stored settings for this automation (thresholds, hours, channels), defaults applied.
  config: Prisma.JsonObject;
  now: Date;
  runKey: string;
  log: FastifyBaseLogger;
}

export interface AutomationDefinition {
  // Stable identifier, stored in `Automation.key` (one row per society).
  key: string;
  name: string;
  description: string;
  // Cron expression (5 fields), evaluated in the Europe/Rome timezone.
  schedule: string;
  enabledByDefault: boolean;
  defaultConfig?: Prisma.InputJsonObject;
  // Idempotency bucket: at most one successful run per (society, automation, runKey).
  // Defaults to the UTC calendar day, i.e. "run once a day".
  runKey?: (now: Date) => string;
  // A short summary of what was done; stored as the run's `result` in the execution log.
  run: (context: AutomationContext) => Promise<Prisma.InputJsonObject>;
}

export class AutomationRegistry {
  private readonly definitions = new Map<string, AutomationDefinition>();

  register(definition: AutomationDefinition): void {
    if (this.definitions.has(definition.key)) {
      throw new Error(`Automation "${definition.key}" is already registered`);
    }
    if (!cron.validate(definition.schedule)) {
      throw new Error(`Automation "${definition.key}" has an invalid cron schedule "${definition.schedule}"`);
    }
    this.definitions.set(definition.key, definition);
  }

  get(key: string): AutomationDefinition | undefined {
    return this.definitions.get(key);
  }

  list(): AutomationDefinition[] {
    return [...this.definitions.values()];
  }
}

export const automationRegistry = new AutomationRegistry();

// Entry point for job authors: call it once per automation (see src/jobs/definitions).
export function registerAutomation(definition: AutomationDefinition): void {
  automationRegistry.register(definition);
}

export function defaultRunKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
