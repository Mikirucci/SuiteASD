import { loadDocumentStates } from '../../modules/documents/indicators.js';
import { startOfUtcDay } from '../../modules/documents/status.js';
import { resolveRecipients } from '../../modules/notifications/recipients.js';
import { createNotification } from '../../modules/notifications/service.js';
import { renderNotification } from '../../modules/notifications/templates.js';
import { ADMIN_DIGEST_DEFAULT_HOUR, adminDigestEntry, parseConfig } from '../catalog.js';
import type { AutomationDefinition } from '../registry.js';
import { dailyCron, localDayRunKey } from '../schedule.js';

const DAY_MS = 86_400_000;
// 1970-01-01 was a Thursday: shifting by 3 days makes the weekly buckets start on Monday.
const MONDAY_SHIFT_DAYS = 3;

// With a weekly digest the summary arrives on the first run of the week, i.e. on Monday; any other length counts
// plain days from the epoch.
export function digestBucket(now: Date, everyDays: number): number {
  const day = Math.floor(startOfUtcDay(now).getTime() / DAY_MS);
  return Math.floor((everyDays === 7 ? day + MONDAY_SHIFT_DAYS : day) / everyDays);
}

// What the administration should look at: the fees overdue and the members whose documents need attention. Nothing
// to report means nothing is sent. Only secretary and administrators receive it (the type is theirs alone).
export const adminDigest: AutomationDefinition = {
  key: adminDigestEntry.key,
  name: adminDigestEntry.name,
  description: adminDigestEntry.description,
  schedule: dailyCron(ADMIN_DIGEST_DEFAULT_HOUR),
  hourOf: (config) => parseConfig(adminDigestEntry, config).hour,
  runKey: localDayRunKey,
  enabledByDefault: true,
  defaultConfig: adminDigestEntry.defaultConfig,
  async run({ db, societyId, config, now }) {
    const { everyDays, channels } = parseConfig(adminDigestEntry, config);
    const bucket = digestBucket(now, everyDays);
    const userIds = await resolveRecipients(db, { kind: 'ROLES', roles: ['ADMIN', 'SEGRETERIA'] });
    const today = startOfUtcDay(now);

    // Fees: overdue is derived (PENDING with a past due day), never stored.
    const overdue = await db.payment.aggregate({
      where: { status: 'PENDING', dueDate: { lt: today }, member: { status: 'ACTIVE' } },
      _count: { _all: true },
      _sum: { amountCents: true },
    });
    const overdueCount = overdue._count._all;
    let notifications = 0;
    if (overdueCount > 0) {
      const { title, body } = renderNotification({
        type: 'ADMIN_FEE_OVERDUE',
        count: overdueCount,
        totalCents: overdue._sum.amountCents ?? 0,
      });
      notifications += await createNotification(db, {
        societyId,
        userIds,
        type: 'ADMIN_FEE_OVERDUE',
        title,
        body,
        data: { count: overdueCount },
        dedupeKey: `admin-digest:fees:${bucket}`,
        channels,
      });
    }

    // Documents: members with something missing or expired, and documents about to expire.
    const members = await db.member.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    const states = await loadDocumentStates({ db }, members.map((member) => member.id), now);
    let membersToFix = 0;
    let documentsToFix = 0;
    let expiringSoon = 0;
    for (const state of states.values()) {
      const broken = state.indicators.filter((indicator) => indicator.status === 'MISSING' || indicator.status === 'EXPIRED').length;
      if (broken > 0) membersToFix += 1;
      documentsToFix += broken;
      expiringSoon += state.indicators.filter((indicator) => indicator.status === 'EXPIRING').length;
    }
    if (membersToFix > 0 || expiringSoon > 0) {
      const { title, body } = renderNotification({ type: 'ADMIN_DOCUMENT_ALERT', membersToFix, documentsToFix, expiringSoon });
      notifications += await createNotification(db, {
        societyId,
        userIds,
        type: 'ADMIN_DOCUMENT_ALERT',
        title,
        body,
        data: { membersToFix, documentsToFix, expiringSoon },
        dedupeKey: `admin-digest:documents:${bucket}`,
        channels,
      });
    }

    return { overdueFees: overdueCount, membersToFix, documentsToFix, expiringSoon, notifications };
  },
};
