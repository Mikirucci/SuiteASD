import { ApiError, describeError } from "@/lib/api";
import type { Automation, AutomationRun, AutomationState, JsonObject, RunStatus } from "./types";

export const STATE_LABELS: Record<AutomationState, string> = {
  COMPLETED: "Completata",
  WAITING: "In corso",
  RUNNING: "In esecuzione",
  FAILED: "Errore",
  DISABLED: "Disattivata",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  SUCCESS: "Riuscita",
  FAILED: "Non riuscita",
  RUNNING: "In esecuzione",
};

const DAILY_CRON = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
const EVERY_MINUTES_CRON = /^\*\/(\d+) \* \* \* \*$/;

/** Plain-language version of the cron expressions the backend uses (Europe/Rome); null when it is not a known pattern. */
export function describeSchedule(cron: string | null): string | null {
  if (cron === null) return null;
  const daily = DAILY_CRON.exec(cron);
  if (daily) return `Ogni giorno alle ${(daily[2] ?? "").padStart(2, "0")}:${(daily[1] ?? "").padStart(2, "0")}`;
  const minutes = EVERY_MINUTES_CRON.exec(cron);
  if (minutes) return `Ogni ${minutes[1]} minuti`;
  return null;
}

/** "Quando parte" line of a checklist row. */
export function describeTrigger(automation: Pick<Automation, "kind" | "schedule">): string | null {
  if (automation.kind === "EVENT") return "Scatta da sola a ogni evento";
  return describeSchedule(automation.schedule);
}

const dateTimeFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** How long a finished run took, in words. */
export function formatDuration(startedAt: string, finishedAt: string | null): string | null {
  if (finishedAt === null) return null;
  const seconds = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 1) return "meno di un secondo";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const RESULT_LABELS: Record<string, string> = {
  feesChecked: "Quote controllate",
  remindersSent: "Promemoria inviati",
  documentsChecked: "Documenti controllati",
  documentsNotified: "Documenti segnalati",
  notifications: "Notifiche create",
  sent: "Email inviate",
  skipped: "Email saltate",
  failed: "Email non riuscite",
  retryLater: "Da riprovare",
  membersChecked: "Tesserati controllati",
  membersReminded: "Tesserati sollecitati",
  overdueFees: "Quote scadute",
  membersToFix: "Tesserati da sistemare",
  documentsToFix: "Documenti da sistemare",
  expiringSoon: "Documenti in scadenza",
  sponsorsChecked: "Sponsor controllati",
  sponsorsNotified: "Sponsor segnalati",
};

/** Counters of a run in Italian ("Quote controllate: 12"); keys the UI does not know are left out. */
export function describeResult(result: JsonObject | null): string[] {
  if (result === null) return [];
  return Object.entries(RESULT_LABELS).flatMap(([key, label]) => {
    const value = result[key];
    return typeof value === "number" ? [`${label}: ${value}`] : [];
  });
}

export function isManualRun(run: Pick<AutomationRun, "runKey">): boolean {
  return run.runKey.startsWith("manual:");
}

const CODE_MESSAGES: Record<string, string> = {
  automation_not_toggleable: "Questa attività segue i tuoi dati e resta sempre attiva.",
  automation_not_runnable: "Questa attività parte da sola quando serve: non c'è nulla da eseguire ora.",
  automation_disabled: "L'attività è disattivata: attivala prima di eseguirla.",
  automation_already_running: "L'attività è appena partita. Riprova tra un momento.",
  invalid_automation_config: "Le impostazioni non sono valide. Controlla i campi evidenziati.",
};

/** Italian message for a failed automation request; falls back to the shared wording. */
export function describeAutomationError(error: unknown): string {
  if (error instanceof ApiError && error.code) {
    const message = CODE_MESSAGES[error.code];
    if (message) return message;
  }
  return describeError(error);
}
