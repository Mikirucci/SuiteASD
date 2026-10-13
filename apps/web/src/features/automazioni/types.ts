/** Response shapes of /automations (see apps/api/src/modules/automations/schema.ts and docs/API.md). */

export type AutomationState = "DISABLED" | "RUNNING" | "FAILED" | "COMPLETED" | "WAITING";
export type AutomationKind = "SCHEDULED" | "EVENT";
export type RunStatus = "RUNNING" | "SUCCESS" | "FAILED";

export type JsonObject = Record<string, unknown>;

export interface AutomationRun {
  id: string;
  automationKey: string;
  runKey: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  result: JsonObject | null;
  error: string | null;
}

export interface Automation {
  key: string;
  name: string;
  description: string;
  kind: AutomationKind;
  /** Cron expression (Europe/Rome) of a scheduled automation. */
  schedule: string | null;
  enabled: boolean;
  /** false: always on, it cannot be switched off. */
  toggleable: boolean;
  /** Whether POST /automations/:key/run can execute it now. */
  runnable: boolean;
  state: AutomationState;
  config: JsonObject;
  lastRunAt: string | null;
  lastRun: AutomationRun | null;
}

export interface AutomationDashboard {
  data: Automation[];
  summary: { active: number; total: number; percentage: number };
}

export interface RunsPage {
  data: AutomationRun[];
  page: { nextCursor: string | null; hasMore: boolean };
}

export interface AutomationPatch {
  enabled?: boolean;
  config?: JsonObject;
}
