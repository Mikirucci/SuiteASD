import type { FastifyInstance } from 'fastify';
import { createEmailTransport } from '../lib/email.js';
import type { AutomationDefinition } from './registry.js';
import { runAutomation, type RunOutcome } from './runner.js';

// "Run now" from the dashboard (SPEC 08, admins only). The run gets its own idempotency bucket so it never
// collides with the scheduled one; jobs are idempotent by design (dedupe keys), so a manual run right after the
// scheduled one simply finds nothing left to do.
export async function runAutomationManually(
  app: FastifyInstance,
  definition: AutomationDefinition,
  societyId: string,
  now: Date = new Date(),
): Promise<RunOutcome> {
  return runAutomation({
    prisma: app.prisma,
    definition,
    societyId,
    now,
    log: app.log,
    email: createEmailTransport(app.config),
    runKey: `manual:${now.toISOString()}`,
  });
}
