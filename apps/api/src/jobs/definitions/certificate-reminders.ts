import { addDays, daysUntil, formatDateOnly, startOfUtcDay } from '../../modules/documents/status.js';
import { createNotification } from '../../modules/notifications/service.js';
import { resolveRecipients } from '../../modules/notifications/recipients.js';
import { renderNotification } from '../../modules/notifications/templates.js';
import { CERTIFICATE_REMINDERS_DEFAULT_HOUR, certificateRemindersEntry, parseConfig } from '../catalog.js';
import type { AutomationDefinition } from '../registry.js';
import { dailyCron, localDayRunKey } from '../schedule.js';

// The smallest configured threshold that covers the remaining days: with [0, 7, 15, 30], 20 days left -> 30,
// 10 -> 15, 3 -> 7, expired or expiring today -> 0. Thresholds are sorted ascending by the config schema.
export function thresholdFor(daysLeft: number, thresholdsDays: readonly number[]): number | null {
  return thresholdsDays.find((threshold) => daysLeft <= threshold) ?? null;
}

// SPEC 02: a daily job warns the athlete AND the guardians as a document approaches its expiry and once it has
// expired. Each (document, expiry date, threshold) is notified once: the dedupe key makes re-running harmless,
// and renewing a document (new expiry date) starts a new cycle.
export const certificateReminders: AutomationDefinition = {
  key: certificateRemindersEntry.key,
  name: certificateRemindersEntry.name,
  description: certificateRemindersEntry.description,
  schedule: dailyCron(CERTIFICATE_REMINDERS_DEFAULT_HOUR),
  hourOf: (config) => parseConfig(certificateRemindersEntry, config).hour,
  runKey: localDayRunKey,
  enabledByDefault: true,
  defaultConfig: certificateRemindersEntry.defaultConfig,
  async run({ db, societyId, config, now }) {
    const { thresholdsDays, channels } = parseConfig(certificateRemindersEntry, config);
    const widest = thresholdsDays.at(-1);
    if (widest === undefined) return { documentsChecked: 0, documentsNotified: 0, notifications: 0 };

    const horizon = addDays(startOfUtcDay(now), widest);
    const candidates = await db.document.findMany({
      where: { expiresAt: { not: null, lte: horizon }, member: { status: 'ACTIVE' } },
      include: { documentType: { select: { name: true } }, member: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });

    // A renewed document supersedes the older ones of the same member and type: only the latest expiry counts.
    const latest = await db.document.groupBy({
      by: ['memberId', 'documentTypeId'],
      where: { memberId: { in: [...new Set(candidates.map((document) => document.memberId))] }, expiresAt: { not: null } },
      _max: { expiresAt: true },
    });
    const latestExpiry = new Map(
      latest.map((row) => [`${row.memberId}:${row.documentTypeId}`, row._max.expiresAt?.getTime() ?? 0]),
    );

    let documentsNotified = 0;
    let notifications = 0;
    for (const document of candidates) {
      const { expiresAt } = document;
      if (!expiresAt) continue;
      if (expiresAt.getTime() < (latestExpiry.get(`${document.memberId}:${document.documentTypeId}`) ?? 0)) continue;

      const daysLeft = daysUntil(expiresAt, now);
      const threshold = thresholdFor(daysLeft, thresholdsDays);
      if (threshold === null) continue;

      const { title, body } = renderNotification({
        type: 'CERTIFICATE_EXPIRING',
        memberName: `${document.member.firstName} ${document.member.lastName}`,
        documentName: document.documentType.name,
        daysLeft,
      });
      const written = await createNotification(db, {
        societyId,
        userIds: await resolveRecipients(db, { kind: 'MEMBERS', memberIds: [document.memberId] }),
        type: 'CERTIFICATE_EXPIRING',
        title,
        body,
        data: { documentId: document.id, memberId: document.memberId, expiresAt: formatDateOnly(expiresAt), daysLeft },
        dedupeKey: `document:${document.id}:${formatDateOnly(expiresAt)}:${threshold}`,
        channels,
      });
      if (written > 0) documentsNotified += 1;
      notifications += written;
    }
    return { documentsChecked: candidates.length, documentsNotified, notifications };
  },
};
