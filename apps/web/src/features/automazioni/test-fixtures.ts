import type { Automation, AutomationDashboard, AutomationRun } from "./types";

/** Realistic answers of GET /automations and /automations/:key/runs, shared by the Vitest and Playwright specs. */

export const WRITE_PERMISSIONS = ["automations:read", "automations:write"];
export const READ_PERMISSIONS = ["automations:read"];

const BOTH_CHANNELS = ["IN_APP", "EMAIL"];

export function makeRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: "run-1",
    automationKey: "fee-reminders",
    runKey: "2026-11-12",
    status: "SUCCESS",
    startedAt: "2026-11-12T08:00:00.000Z",
    finishedAt: "2026-11-12T08:00:02.000Z",
    result: { feesChecked: 12, remindersSent: 3 },
    error: null,
    ...overrides,
  };
}

export function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    key: "fee-reminders",
    name: "Ricordare le quote",
    description: "Promemoria prima della scadenza e solleciti dopo, ad atleti e genitori.",
    kind: "SCHEDULED",
    schedule: "0 9 * * *",
    enabled: true,
    toggleable: true,
    runnable: true,
    state: "COMPLETED",
    config: { hour: 9, channels: BOTH_CHANNELS, beforeDueDays: [1, 7], afterDueDays: [3, 10] },
    lastRunAt: "2026-11-12T08:00:00.000Z",
    lastRun: makeRun(),
    ...overrides,
  };
}

export const FEE_REMINDERS = makeAutomation();

export const CERTIFICATE_REMINDERS = makeAutomation({
  key: "certificate-reminders",
  name: "Controllare i certificati",
  description: "Avvisa atleti e genitori quando un documento sta per scadere o è scaduto.",
  schedule: "0 8 * * *",
  state: "FAILED",
  config: { hour: 8, channels: BOTH_CHANNELS, thresholdsDays: [0, 7, 15, 30] },
  lastRun: makeRun({
    id: "run-cert",
    automationKey: "certificate-reminders",
    status: "FAILED",
    result: null,
    error: "SMTP connection refused",
  }),
});

export const CONVOCATION_DISPATCH = makeAutomation({
  key: "convocation-dispatch",
  name: "Inviare le convocazioni",
  description: "Invia le convocazioni a N giorni dalla gara e ricorda a chi non ha risposto.",
  schedule: null,
  runnable: false,
  enabled: false,
  state: "DISABLED",
  config: { hour: 9, channels: BOTH_CHANNELS, daysBefore: 3, remindNonRespondents: true, reminderDaysBefore: 1 },
  lastRunAt: null,
  lastRun: null,
});

export const STANDINGS = makeAutomation({
  key: "standings",
  name: "Aggiornare le classifiche",
  description: "La classifica è derivata dai risultati: si aggiorna a ogni risultato inserito, sempre attiva.",
  kind: "EVENT",
  schedule: null,
  toggleable: false,
  runnable: false,
  state: "COMPLETED",
  config: {},
  lastRunAt: null,
  lastRun: null,
});

export const RECEIPTS = makeAutomation({
  key: "receipts",
  name: "Emettere le ricevute",
  description: "Emette la ricevuta numerata appena un pagamento viene registrato.",
  kind: "EVENT",
  schedule: null,
  runnable: false,
  state: "COMPLETED",
  config: {},
  lastRunAt: null,
  lastRun: null,
});

export const NOTIFICATIONS_DISPATCH = makeAutomation({
  key: "notifications-dispatch",
  name: "Avvisare atleti e genitori",
  description: "Recapita le notifiche in coda (email) con nuovi tentativi in caso di errore.",
  schedule: "*/10 * * * *",
  state: "WAITING",
  config: { maxAttempts: 3, batchSize: 100 },
  lastRunAt: null,
  lastRun: null,
});

export const MISSING_DOCUMENTS = makeAutomation({
  key: "missing-documents",
  name: "Sollecitare i documenti mancanti",
  description: "Ricorda ad atleti e genitori i documenti richiesti che non hanno ancora caricato.",
  schedule: "0 10 * * *",
  state: "WAITING",
  config: { hour: 10, channels: BOTH_CHANNELS, graceDays: 3, everyDays: 7 },
  lastRunAt: null,
  lastRun: null,
});

export const ADMIN_ALERTS = makeAutomation({
  key: "admin-alerts",
  name: "Avvisare l'amministrazione",
  description: "Avvisa subito segreteria e amministratori di pagamenti ricevuti, documenti caricati e nuove iscrizioni.",
  kind: "EVENT",
  schedule: null,
  runnable: false,
  state: "COMPLETED",
  config: {},
  lastRunAt: null,
  lastRun: null,
});

export const ADMIN_DIGEST = makeAutomation({
  key: "admin-digest",
  name: "Riepilogo per l'amministrazione",
  description: "Riassume a segreteria e amministratori le quote scadute e i documenti da sistemare.",
  schedule: "0 8 * * *",
  state: "WAITING",
  config: { hour: 8, channels: BOTH_CHANNELS, everyDays: 7 },
  lastRunAt: null,
  lastRun: null,
});

export const SPONSOR_EXPIRY = makeAutomation({
  key: "sponsor-expiry",
  name: "Avvisare i contratti sponsor in scadenza",
  description: "Avvisa l'amministrazione prima che scada il contratto di uno sponsor.",
  schedule: "0 9 * * *",
  state: "WAITING",
  config: { hour: 9, channels: BOTH_CHANNELS, thresholdsDays: [7, 30] },
  lastRunAt: null,
  lastRun: null,
});

export function makeDashboard(data: Automation[]): AutomationDashboard {
  const active = data.filter((automation) => automation.enabled).length;
  return { data, summary: { active, total: data.length, percentage: Math.round((active / data.length) * 100) } };
}

export const ALL_AUTOMATIONS: Automation[] = [
  FEE_REMINDERS,
  CERTIFICATE_REMINDERS,
  MISSING_DOCUMENTS,
  CONVOCATION_DISPATCH,
  STANDINGS,
  RECEIPTS,
  NOTIFICATIONS_DISPATCH,
  ADMIN_ALERTS,
  ADMIN_DIGEST,
  SPONSOR_EXPIRY,
];

export const DASHBOARD = makeDashboard(ALL_AUTOMATIONS);
