import type { Automation, AutomationRun, Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { AUTOMATION_CATALOG, catalogEntryFor, parseConfig, type CatalogEntry } from '../../jobs/catalog.js';
import { builtInAutomations } from '../../jobs/definitions/index.js';
import { ensureAutomationRow } from '../../jobs/event-automations.js';
import { runAutomationManually } from '../../jobs/manual-run.js';
import { STALE_RUN_MS } from '../../jobs/runner.js';
import { conflict, notFound, unprocessable, type FieldError } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import type {
  AutomationDashboardDto,
  AutomationDto,
  AutomationRunDto,
  AutomationState,
  ListRunsQuery,
  UpdateAutomationBody,
} from './schema.js';

// Dashboard "Attivita gestite dall'app" (SPEC 08): the six catalog activities with their stored state.

function jsonObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

function definitionFor(key: string) {
  return builtInAutomations.find((definition) => definition.key === key);
}

function toRunDto(run: AutomationRun, key: string): AutomationRunDto {
  const status = run.status === 'SUCCESS' || run.status === 'FAILED' ? run.status : 'RUNNING';
  return {
    id: run.id,
    automationKey: key,
    runKey: run.runKey,
    status,
    startedAt: toIso(run.startedAt),
    finishedAt: toIsoOrNull(run.finishedAt),
    result: run.result === null ? null : jsonObject(run.result),
    error: run.error,
  };
}

function stateOf(entry: CatalogEntry, enabled: boolean, lastRun: AutomationRun | null, now: Date): AutomationState {
  if (!enabled) return 'DISABLED';
  if (lastRun?.status === 'RUNNING' && now.getTime() - lastRun.startedAt.getTime() < STALE_RUN_MS) return 'RUNNING';
  if (lastRun?.status === 'FAILED') return 'FAILED';
  // An event-driven activity is "done" as soon as it is on: it acts whenever its trigger happens.
  return entry.kind === 'EVENT' || lastRun?.status === 'SUCCESS' ? 'COMPLETED' : 'WAITING';
}

function toDto(entry: CatalogEntry, row: Automation | null, lastRun: AutomationRun | null, now: Date): AutomationDto {
  const enabled = row?.enabled ?? true;
  return {
    key: entry.key,
    name: entry.name,
    description: entry.description,
    kind: entry.kind,
    schedule: definitionFor(entry.key)?.schedule ?? null,
    enabled,
    toggleable: entry.toggleable,
    runnable: entry.kind === 'SCHEDULED' && definitionFor(entry.key) !== undefined,
    state: stateOf(entry, enabled, lastRun, now),
    config: jsonObject(row ? parseConfig(entry, row.config) : entry.defaultConfig),
    lastRunAt: toIsoOrNull(row?.lastRunAt ?? null),
    lastRun: lastRun ? toRunDto(lastRun, entry.key) : null,
  };
}

async function lastRunOf({ db }: TenantRequestContext, row: Automation | null): Promise<AutomationRun | null> {
  if (!row) return null;
  return db.automationRun.findFirst({ where: { automationId: row.id }, orderBy: [{ startedAt: 'desc' }, { id: 'asc' }] });
}

async function presentOne(ctx: TenantRequestContext, entry: CatalogEntry, now: Date): Promise<AutomationDto> {
  const row = await ctx.db.automation.findFirst({ where: { key: entry.key } });
  return toDto(entry, row, await lastRunOf(ctx, row), now);
}

function requireEntry(key: string): CatalogEntry {
  const entry = catalogEntryFor(key);
  if (!entry) throw notFound('Automation');
  return entry;
}

export async function getDashboard(ctx: TenantRequestContext, now = new Date()): Promise<AutomationDashboardDto> {
  const data = await Promise.all(AUTOMATION_CATALOG.map((entry) => presentOne(ctx, entry, now)));
  const active = data.filter((automation) => automation.enabled).length;
  return {
    data,
    summary: { active, total: data.length, percentage: Math.round((active / data.length) * 100) },
  };
}

export async function updateAutomation(
  ctx: TenantRequestContext,
  key: string,
  body: UpdateAutomationBody,
  now = new Date(),
): Promise<AutomationDto> {
  const entry = requireEntry(key);
  if (body.enabled === false && !entry.toggleable) {
    throw unprocessable('automation_not_toggleable', `"${entry.name}" is derived from your data and cannot be switched off`);
  }

  const current = await ensureAutomationRow(ctx.db, ctx.auth.societyId, key);
  let config: Prisma.InputJsonObject | undefined;
  if (body.config !== undefined) {
    // Partial update: the sent settings are merged into the stored ones, then the whole set is validated.
    const parsed = entry.configSchema.safeParse({ ...jsonObject(current.config), ...body.config });
    if (!parsed.success) {
      const errors: FieldError[] = parsed.error.issues.map((issue) => ({
        path: ['config', ...issue.path.map(String)].join('.'),
        message: issue.message,
      }));
      throw unprocessable('invalid_automation_config', 'The automation settings are not valid', errors);
    }
    config = parsed.data;
  }

  const row = await ctx.db.automation.update({
    where: { id: current.id },
    data: { ...(body.enabled === undefined ? {} : { enabled: body.enabled }), ...(config ? { config } : {}) },
  });
  return toDto(entry, row, await lastRunOf(ctx, row), now);
}

export async function listRuns(ctx: TenantRequestContext, key: string, query: ListRunsQuery): Promise<Page<AutomationRunDto>> {
  requireEntry(key);
  const row = await ctx.db.automation.findFirst({ where: { key } });
  if (!row) return { data: [], page: { nextCursor: null, hasMore: false } };
  const runs = await ctx.db.automationRun.findMany({
    where: { automationId: row.id },
    orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(runs, query);
  return { data: page.data.map((run) => toRunDto(run, key)), page: page.page };
}

export async function runNow(app: FastifyInstance, ctx: TenantRequestContext, key: string): Promise<AutomationRunDto> {
  const entry = requireEntry(key);
  const definition = definitionFor(key);
  if (entry.kind !== 'SCHEDULED' || !definition) {
    throw conflict('automation_not_runnable', `"${entry.name}" runs by itself when its trigger happens: there is nothing to run now`);
  }
  const outcome = await runAutomationManually(app, definition, ctx.auth.societyId);
  switch (outcome.status) {
    case 'SKIPPED_DISABLED':
      throw conflict('automation_disabled', `"${entry.name}" is switched off: enable it first`);
    case 'SKIPPED_ALREADY_RAN':
      throw conflict('automation_already_running', `"${entry.name}" was just started: try again in a moment`);
    case 'SUCCESS':
    case 'FAILED': {
      const run = await ctx.db.automationRun.findFirst({ where: { id: outcome.runId } });
      if (!run) throw notFound('Automation run');
      return toRunDto(run, key);
    }
  }
}
