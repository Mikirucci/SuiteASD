import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { NOTIFICATION_CHANNELS, notificationChannelSchema, type AutomationKind } from '../shared/enums.js';

// The six "attivita gestite dall'app" of the delegated-management dashboard (SPEC 08), with their per-key
// configuration schema. The scheduled jobs live in src/jobs/definitions and share these keys and defaults.
// EVENT automations have no schedule: the code that performs the action checks `Automation.enabled` (see
// event-automations.ts), exactly like a scheduled job is skipped by the runner when disabled.

// A list of day offsets: unique, ascending after parsing so configuration order never matters.
function dayList(options: { min: number; max: number; maxItems: number }) {
  return z
    .array(z.number().int().min(options.min).max(options.max))
    .max(options.maxItems)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b));
}

// Default run hours (the former fixed cron times).
export const FEE_REMINDERS_DEFAULT_HOUR = 9;
export const CERTIFICATE_REMINDERS_DEFAULT_HOUR = 8;
export const CONVOCATION_DISPATCH_DEFAULT_HOUR = 9;

// Local hour (Europe/Rome) at which a daily automation runs for the society.
function hourField(defaultHour: number) {
  return z.number().int().min(0).max(23).default(defaultHour);
}

// Channels the automation may notify through, on top of each user's own preferences (both must allow a channel).
// Unique and in canonical order, so the stored value does not depend on how the client listed them.
function channelsField() {
  return z
    .array(notificationChannelSchema)
    .min(1)
    .transform((channels) => NOTIFICATION_CHANNELS.filter((channel) => channels.includes(channel)))
    .default([...NOTIFICATION_CHANNELS]);
}

export const feeRemindersConfigSchema = z.strictObject({
  hour: hourField(FEE_REMINDERS_DEFAULT_HOUR),
  channels: channelsField(),
  // Days BEFORE the due date on which a reminder goes out (7 = "one week before").
  beforeDueDays: dayList({ min: 1, max: 60, maxItems: 5 }).default([1, 7]),
  // Days AFTER the due date on which an overdue follow-up goes out.
  afterDueDays: dayList({ min: 1, max: 120, maxItems: 5 }).default([3, 10]),
});

export const certificateRemindersConfigSchema = z.strictObject({
  hour: hourField(CERTIFICATE_REMINDERS_DEFAULT_HOUR),
  channels: channelsField(),
  // Days before expiry; 0 = the expiry day onwards ("a scadenza avvenuta").
  thresholdsDays: dayList({ min: 0, max: 365, maxItems: 6 }).default([0, 7, 15, 30]),
});

export const convocationDispatchConfigSchema = z.strictObject({
  hour: hourField(CONVOCATION_DISPATCH_DEFAULT_HOUR),
  channels: channelsField(),
  // Convocations of an event are sent this many days before it starts.
  daysBefore: z.number().int().min(1).max(30).default(3),
  // Whether athletes who have not answered get a reminder, and how many days before the event.
  remindNonRespondents: z.boolean().default(true),
  reminderDaysBefore: z.number().int().min(0).max(14).default(1),
});

export const noConfigSchema = z.strictObject({});

export const notificationsDispatchConfigSchema = z.strictObject({
  // An email that fails is retried until it has been attempted this many times.
  maxAttempts: z.number().int().min(1).max(10).default(3),
  // Emails handled by one run.
  batchSize: z.number().int().min(1).max(500).default(100),
});

export interface CatalogEntry<S extends z.ZodType<Prisma.InputJsonObject> = z.ZodType<Prisma.InputJsonObject>> {
  key: string;
  // Dashboard checklist label (Italian, SPEC 08).
  name: string;
  description: string;
  kind: AutomationKind;
  // false: the behaviour is derived and cannot be switched off (standings).
  toggleable: boolean;
  configSchema: S;
  defaultConfig: Prisma.InputJsonObject;
}

function entry<S extends z.ZodType<Prisma.InputJsonObject>>(
  definition: Omit<CatalogEntry<S>, 'defaultConfig'>,
): CatalogEntry<S> {
  return { ...definition, defaultConfig: definition.configSchema.parse({}) };
}

export const feeRemindersEntry = entry({
  key: 'fee-reminders',
  name: 'Ricordare le quote',
  description: 'Promemoria prima della scadenza e solleciti dopo, ad atleti e genitori.',
  kind: 'SCHEDULED',
  toggleable: true,
  configSchema: feeRemindersConfigSchema,
});

export const certificateRemindersEntry = entry({
  key: 'certificate-reminders',
  name: 'Controllare i certificati',
  description: 'Avvisa atleti e genitori quando un documento sta per scadere o e scaduto.',
  kind: 'SCHEDULED',
  toggleable: true,
  configSchema: certificateRemindersConfigSchema,
});

export const convocationDispatchEntry = entry({
  key: 'convocation-dispatch',
  name: 'Inviare le convocazioni',
  description: 'Invia le convocazioni a N giorni dalla gara e ricorda a chi non ha risposto.',
  kind: 'SCHEDULED',
  toggleable: true,
  configSchema: convocationDispatchConfigSchema,
});

export const standingsEntry = entry({
  key: 'standings',
  name: 'Aggiornare le classifiche',
  description: 'La classifica e derivata dai risultati: si aggiorna ad ogni risultato inserito, sempre attiva.',
  kind: 'EVENT',
  toggleable: false,
  configSchema: noConfigSchema,
});

export const receiptsEntry = entry({
  key: 'receipts',
  name: 'Emettere le ricevute',
  description: 'Emette la ricevuta numerata appena un pagamento viene registrato.',
  kind: 'EVENT',
  toggleable: true,
  configSchema: noConfigSchema,
});

export const notificationsDispatchEntry = entry({
  key: 'notifications-dispatch',
  name: 'Avvisare atleti e genitori',
  description: 'Recapita le notifiche in coda (email) con nuovi tentativi in caso di errore.',
  kind: 'SCHEDULED',
  toggleable: true,
  configSchema: notificationsDispatchConfigSchema,
});

// Dashboard order = SPEC 08 checklist order.
export const AUTOMATION_CATALOG: readonly CatalogEntry[] = [
  feeRemindersEntry,
  certificateRemindersEntry,
  convocationDispatchEntry,
  standingsEntry,
  receiptsEntry,
  notificationsDispatchEntry,
];

export function catalogEntryFor(key: string): CatalogEntry | undefined {
  return AUTOMATION_CATALOG.find((candidate) => candidate.key === key);
}

// The stored configuration read through the key's schema; unreadable or outdated values fall back to the defaults.
export function parseConfig<S extends z.ZodType<Prisma.InputJsonObject>>(
  catalogEntry: CatalogEntry<S>,
  stored: Prisma.InputJsonValue | null | undefined,
): z.output<S> {
  const parsed = catalogEntry.configSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : catalogEntry.configSchema.parse({});
}
