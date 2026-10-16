import type { Prisma } from '@prisma/client';
import { logEventRun, isAutomationEnabled } from '../../jobs/event-automations.js';
import type { TenantDb } from '../../lib/tenant.js';
import type { OrganisationNotificationType } from '../../shared/enums.js';
import { resolveRecipients } from './recipients.js';
import { createNotification } from './service.js';
import { renderNotification, type NotificationTemplate } from './templates.js';

// Key of the event automation "Avvisare l'amministrazione" (see jobs/catalog.ts): while it is off the
// administration is not told about payments, uploaded documents and new enrolments as they happen.
export const ADMIN_ALERTS_KEY = 'admin-alerts';

export type OrganisationTemplate = Extract<NotificationTemplate, { type: OrganisationNotificationType }>;

export interface AdministrationAlert {
  societyId: string;
  template: OrganisationTemplate;
  // One alert per key: repeating the same event (a retried request) never notifies twice.
  dedupeKey: string;
  // References to the subject, so the web app can deep-link.
  data?: Prisma.InputJsonObject;
  // Whoever caused the event already knows about it: they are not notified.
  exceptUserId?: string;
  now: Date;
}

// Tells the society's administrators and secretaries about something that needs their attention, through the
// automation that governs these alerts. Returns the number of notification rows written (0 when the automation is
// off, nobody is to be told, or the alert was already sent).
export async function notifyAdministration(db: TenantDb, alert: AdministrationAlert): Promise<number> {
  if (!(await isAutomationEnabled(db, ADMIN_ALERTS_KEY))) return 0;
  const recipients = await resolveRecipients(db, { kind: 'ROLES', roles: ['ADMIN', 'SEGRETERIA'] });
  const userIds = recipients.filter((userId) => userId !== alert.exceptUserId);
  const { title, body } = renderNotification(alert.template);
  const written = await createNotification(db, {
    societyId: alert.societyId,
    userIds,
    type: alert.template.type,
    title,
    body,
    dedupeKey: alert.dedupeKey,
    ...(alert.data ? { data: alert.data } : {}),
  });
  if (written > 0) {
    await logEventRun(db, {
      societyId: alert.societyId,
      key: ADMIN_ALERTS_KEY,
      runKey: alert.dedupeKey,
      result: { type: alert.template.type, recipients: userIds.length },
      now: alert.now,
    });
  }
  return written;
}
