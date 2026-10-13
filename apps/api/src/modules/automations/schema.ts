import { z } from 'zod';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { AUTOMATION_KINDS } from '../../shared/enums.js';

export const automationKeyParamsSchema = z.object({ key: z.string().min(1).max(64) });

// Where the activity stands on the dashboard checklist (SPEC 08).
export const AUTOMATION_STATES = ['DISABLED', 'RUNNING', 'FAILED', 'COMPLETED', 'WAITING'] as const;
export const automationStateSchema = z.enum(AUTOMATION_STATES);
export type AutomationState = z.infer<typeof automationStateSchema>;

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const automationRunSchema = z.object({
  id: z.string(),
  automationKey: z.string(),
  runKey: z.string(),
  status: z.enum(['RUNNING', 'SUCCESS', 'FAILED']),
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
  result: jsonObjectSchema.nullable(),
  error: z.string().nullable(),
});

export const automationSchema = z.object({
  key: z.string(),
  name: z.string().describe('Checklist label, e.g. "Ricordare le quote"'),
  description: z.string(),
  kind: z.enum(AUTOMATION_KINDS).describe('SCHEDULED runs on a timer; EVENT runs when the triggering action happens'),
  schedule: z.string().nullable().describe('Cron expression (Europe/Rome) of a SCHEDULED automation'),
  enabled: z.boolean(),
  toggleable: z.boolean().describe('false: always on (derived behaviour that cannot be switched off)'),
  runnable: z.boolean().describe('Whether POST /automations/:key/run can execute it now'),
  state: automationStateSchema,
  config: jsonObjectSchema,
  lastRunAt: isoDateTimeSchema.nullable(),
  lastRun: automationRunSchema.nullable(),
});

export const automationDashboardSchema = z.object({
  data: z.array(automationSchema),
  summary: z.object({
    active: z.number().int(),
    total: z.number().int(),
    percentage: z.number().int().describe('Active automations / total, rounded (0-100)'),
  }),
});

export const updateAutomationBodySchema = z
  .object({
    enabled: z.boolean(),
    config: jsonObjectSchema.describe('Settings to change; validated against the automation key and merged into the stored ones'),
  })
  .partial()
  .refine((body) => body.enabled !== undefined || body.config !== undefined, {
    message: 'At least one of enabled or config is required',
  });

export const listRunsQuerySchema = paginationQuerySchema;

export type AutomationDto = z.infer<typeof automationSchema>;
export type AutomationDashboardDto = z.infer<typeof automationDashboardSchema>;
export type AutomationRunDto = z.infer<typeof automationRunSchema>;
export type UpdateAutomationBody = z.infer<typeof updateAutomationBodySchema>;
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
