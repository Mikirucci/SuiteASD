import { addDays, daysUntil, formatDateOnly, startOfUtcDay } from '../../modules/documents/status.js';
import { resolveRecipients } from '../../modules/notifications/recipients.js';
import { createNotification } from '../../modules/notifications/service.js';
import { renderNotification } from '../../modules/notifications/templates.js';
import { SPONSOR_EXPIRY_DEFAULT_HOUR, parseConfig, sponsorExpiryEntry } from '../catalog.js';
import type { AutomationDefinition } from '../registry.js';
import { dailyCron, localDayRunKey } from '../schedule.js';
import { thresholdFor } from './certificate-reminders.js';

// The administration is warned when the contract of an active sponsor is about to end: once per configured
// threshold (30 and 7 days before by default). Renewing the contract (a new end date) starts a new cycle.
export const sponsorExpiry: AutomationDefinition = {
  key: sponsorExpiryEntry.key,
  name: sponsorExpiryEntry.name,
  description: sponsorExpiryEntry.description,
  schedule: dailyCron(SPONSOR_EXPIRY_DEFAULT_HOUR),
  hourOf: (config) => parseConfig(sponsorExpiryEntry, config).hour,
  runKey: localDayRunKey,
  enabledByDefault: true,
  defaultConfig: sponsorExpiryEntry.defaultConfig,
  async run({ db, societyId, config, now }) {
    const { thresholdsDays, channels } = parseConfig(sponsorExpiryEntry, config);
    const widest = thresholdsDays.at(-1);
    if (widest === undefined) return { sponsorsChecked: 0, sponsorsNotified: 0, notifications: 0 };

    const today = startOfUtcDay(now);
    const sponsors = await db.sponsor.findMany({
      where: { status: 'ACTIVE', contractEnd: { not: null, gte: today, lte: addDays(today, widest) } },
      orderBy: [{ contractEnd: 'asc' }, { id: 'asc' }],
    });
    const userIds = await resolveRecipients(db, { kind: 'ROLES', roles: ['ADMIN', 'SEGRETERIA'] });

    let sponsorsNotified = 0;
    let notifications = 0;
    for (const sponsor of sponsors) {
      const { contractEnd } = sponsor;
      if (!contractEnd) continue;
      const daysLeft = daysUntil(contractEnd, now);
      const threshold = thresholdFor(daysLeft, thresholdsDays);
      if (threshold === null) continue;

      const { title, body } = renderNotification({ type: 'ADMIN_SPONSOR_EXPIRING', sponsorName: sponsor.name, daysLeft });
      const written = await createNotification(db, {
        societyId,
        userIds,
        type: 'ADMIN_SPONSOR_EXPIRING',
        title,
        body,
        data: { sponsorId: sponsor.id, contractEnd: formatDateOnly(contractEnd), daysLeft },
        dedupeKey: `sponsor:${sponsor.id}:${formatDateOnly(contractEnd)}:${threshold}`,
        channels,
      });
      if (written > 0) sponsorsNotified += 1;
      notifications += written;
    }
    return { sponsorsChecked: sponsors.length, sponsorsNotified, notifications };
  },
};
