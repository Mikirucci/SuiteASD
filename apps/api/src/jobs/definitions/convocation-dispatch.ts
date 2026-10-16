import { remindPendingConvocations, sendConvocations } from '../../modules/convocations/service.js';
import { startOfUtcDay } from '../../modules/documents/status.js';
import { CONVOCATION_DISPATCH_DEFAULT_HOUR, convocationDispatchEntry, parseConfig } from '../catalog.js';
import type { AutomationDefinition } from '../registry.js';
import { dailyCron, localDayRunKey } from '../schedule.js';

const DAY_MS = 86_400_000;

// "N days before" counts calendar days: with N = 3 an event on the 14th is reached from the morning of the 11th.
function withinDays(now: Date, days: number): Date {
  return new Date(startOfUtcDay(now).getTime() + (days + 1) * DAY_MS);
}

// SPEC 04: the coach prepares the convocations, the app sends them `daysBefore` days before the event and, if
// enabled, reminds the athletes who have not answered during the last `reminderDaysBefore` days. Both steps are
// idempotent (convocations are marked as sent, reminders are deduplicated per day), so re-running is harmless.
export const convocationDispatch: AutomationDefinition = {
  key: convocationDispatchEntry.key,
  name: convocationDispatchEntry.name,
  description: convocationDispatchEntry.description,
  schedule: dailyCron(CONVOCATION_DISPATCH_DEFAULT_HOUR),
  hourOf: (config) => parseConfig(convocationDispatchEntry, config).hour,
  runKey: localDayRunKey,
  enabledByDefault: true,
  defaultConfig: convocationDispatchEntry.defaultConfig,
  async run({ db, societyId, config, now }) {
    const { daysBefore, remindNonRespondents, reminderDaysBefore, channels } = parseConfig(convocationDispatchEntry, config);
    const scope = { db, societyId, channels };

    const toSend = await db.event.findMany({
      where: {
        status: { not: 'CANCELLED' },
        startsAt: { gt: now, lt: withinDays(now, daysBefore) },
        convocations: { some: { sentAt: null } },
      },
      select: { id: true },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    let convocationsSent = 0;
    let notifications = 0;
    for (const event of toSend) {
      const result = await sendConvocations(scope, event.id, now);
      convocationsSent += result.sent;
      notifications += result.notified;
    }

    let remindersSent = 0;
    if (remindNonRespondents) {
      // Events whose convocations went out on an earlier day: the ones sent just now do not need a reminder yet.
      const toRemind = await db.event.findMany({
        where: {
          status: { not: 'CANCELLED' },
          startsAt: { gt: now, lt: withinDays(now, reminderDaysBefore) },
          convocationsSentAt: { not: null, lt: startOfUtcDay(now) },
        },
        select: { id: true },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      });
      for (const event of toRemind) {
        const result = await remindPendingConvocations(scope, event.id, now);
        remindersSent += result.reminded;
        notifications += result.notified;
      }
    }

    return { eventsDispatched: toSend.length, convocationsSent, remindersSent, notifications };
  },
};
