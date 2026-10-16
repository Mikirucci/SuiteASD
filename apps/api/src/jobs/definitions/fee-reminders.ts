import { addDays, startOfUtcDay } from '../../modules/documents/status.js';
import { resolveRecipients } from '../../modules/notifications/recipients.js';
import { createNotification } from '../../modules/notifications/service.js';
import { renderNotification } from '../../modules/notifications/templates.js';
import { FEE_REMINDERS_DEFAULT_HOUR, feeRemindersEntry, parseConfig } from '../catalog.js';
import type { AutomationDefinition } from '../registry.js';
import { dailyCron, localDayRunKey } from '../schedule.js';

const DAY_MS = 86_400_000;

// Reminder steps as day offsets from the due date: -7 = one week before, +3 = three days overdue.
export function reminderSteps(beforeDueDays: readonly number[], afterDueDays: readonly number[]): number[] {
  return [...beforeDueDays.map((days) => -days), ...afterDueDays].sort((a, b) => a - b);
}

// The latest step already reached (offset = days since the due date). Missed steps are not replayed: a run that
// comes late sends only the current one.
export function currentStep(offsetDays: number, steps: readonly number[]): number | null {
  return steps.filter((step) => step <= offsetDays).at(-1) ?? null;
}

// SPEC 03: reminders before the due date and follow-ups after it, to the athlete and the guardians. Each
// (fee, step) is sent once (dedupe key); a reminder that reached somebody bumps the fee's `reminderCount`, which is
// the "Promemoria inviati" counter of the fees summary.
export const feeReminders: AutomationDefinition = {
  key: feeRemindersEntry.key,
  name: feeRemindersEntry.name,
  description: feeRemindersEntry.description,
  schedule: dailyCron(FEE_REMINDERS_DEFAULT_HOUR),
  hourOf: (config) => parseConfig(feeRemindersEntry, config).hour,
  runKey: localDayRunKey,
  enabledByDefault: true,
  defaultConfig: feeRemindersEntry.defaultConfig,
  async run({ db, societyId, config, now }) {
    const { beforeDueDays, afterDueDays, channels } = parseConfig(feeRemindersEntry, config);
    const steps = reminderSteps(beforeDueDays, afterDueDays);
    const earliest = steps[0];
    if (earliest === undefined) return { feesChecked: 0, remindersSent: 0 };

    const today = startOfUtcDay(now);
    const pending = await db.payment.findMany({
      where: { status: 'PENDING', dueDate: { lte: addDays(today, -earliest) }, member: { status: 'ACTIVE' } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });

    let remindersSent = 0;
    for (const payment of pending) {
      const offset = Math.round((today.getTime() - payment.dueDate.getTime()) / DAY_MS);
      const step = currentStep(offset, steps);
      if (step === null) continue;

      const { title, body } = renderNotification({
        type: 'FEE_DUE',
        description: payment.description,
        amountCents: payment.amountCents,
        dueDate: payment.dueDate,
        today,
      });
      const written = await createNotification(db, {
        societyId,
        userIds: await resolveRecipients(db, { kind: 'MEMBERS', memberIds: [payment.memberId] }),
        type: 'FEE_DUE',
        title,
        body,
        data: { paymentId: payment.id, memberId: payment.memberId, amountCents: payment.amountCents },
        dedupeKey: `fee:${payment.id}:${step}`,
        channels,
      });
      if (written === 0) continue;
      await db.payment.update({
        where: { id: payment.id },
        data: { reminderCount: { increment: 1 }, lastReminderAt: now },
      });
      remindersSent += 1;
    }
    return { feesChecked: pending.length, remindersSent };
  },
};
