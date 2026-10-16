import { loadDocumentStates } from '../../modules/documents/indicators.js';
import { addDays, startOfUtcDay } from '../../modules/documents/status.js';
import { resolveRecipients } from '../../modules/notifications/recipients.js';
import { createNotification } from '../../modules/notifications/service.js';
import { renderNotification } from '../../modules/notifications/templates.js';
import { MISSING_DOCUMENTS_DEFAULT_HOUR, missingDocumentsEntry, parseConfig } from '../catalog.js';
import type { AutomationDefinition } from '../registry.js';
import { dailyCron, localDayRunKey } from '../schedule.js';

const DAY_MS = 86_400_000;

// The reminder repeats every `everyDays` days: the run of any day belongs to one bucket, and the dedupe key of the
// bucket lets the first run through and silences the rest.
export function reminderBucket(now: Date, everyDays: number): number {
  return Math.floor(startOfUtcDay(now).getTime() / DAY_MS / everyDays);
}

// Athletes and guardians are asked for the required documents that were never provided. (Documents that are
// expired or about to expire are the business of "certificate-reminders".) The member's own account and the
// guardians' accounts are notified; a member nobody can be reached for is simply skipped.
export const missingDocuments: AutomationDefinition = {
  key: missingDocumentsEntry.key,
  name: missingDocumentsEntry.name,
  description: missingDocumentsEntry.description,
  schedule: dailyCron(MISSING_DOCUMENTS_DEFAULT_HOUR),
  hourOf: (config) => parseConfig(missingDocumentsEntry, config).hour,
  runKey: localDayRunKey,
  enabledByDefault: true,
  defaultConfig: missingDocumentsEntry.defaultConfig,
  async run({ db, societyId, config, now }) {
    const { graceDays, everyDays, channels } = parseConfig(missingDocumentsEntry, config);
    const members = await db.member.findMany({
      where: { status: 'ACTIVE', createdAt: { lte: addDays(now, -graceDays) } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const states = await loadDocumentStates({ db }, members.map((member) => member.id), now);
    const bucket = reminderBucket(now, everyDays);

    let membersReminded = 0;
    let notifications = 0;
    for (const member of members) {
      const missing = (states.get(member.id)?.indicators ?? []).filter((indicator) => indicator.status === 'MISSING');
      if (missing.length === 0) continue;

      const { title, body } = renderNotification({
        type: 'DOCUMENT_MISSING',
        memberName: `${member.firstName} ${member.lastName}`,
        documentNames: missing.map((indicator) => indicator.name),
      });
      const written = await createNotification(db, {
        societyId,
        userIds: await resolveRecipients(db, { kind: 'MEMBERS', memberIds: [member.id] }),
        type: 'DOCUMENT_MISSING',
        title,
        body,
        data: { memberId: member.id, documentTypeIds: missing.map((indicator) => indicator.documentTypeId) },
        dedupeKey: `missing-documents:${member.id}:${bucket}`,
        channels,
      });
      if (written > 0) membersReminded += 1;
      notifications += written;
    }
    return { membersChecked: members.length, membersReminded, notifications };
  },
};
