import { dispatchQueuedEmails } from '../../modules/notifications/dispatch.js';
import { notificationsDispatchEntry, parseConfig } from '../catalog.js';
import type { AutomationDefinition } from '../registry.js';

const BUCKET_MS = 10 * 60 * 1000;

// SPEC 07/08 "Avvisare atleti e genitori": delivers the queued emails every 10 minutes. The bucket makes the run
// idempotent per 10-minute window; a message is also claimed row by row, so overlapping runs never send it twice.
export const notificationsDispatch: AutomationDefinition = {
  key: notificationsDispatchEntry.key,
  name: notificationsDispatchEntry.name,
  description: notificationsDispatchEntry.description,
  schedule: '*/10 * * * *',
  enabledByDefault: true,
  defaultConfig: notificationsDispatchEntry.defaultConfig,
  runKey: (now) => `dispatch:${new Date(Math.floor(now.getTime() / BUCKET_MS) * BUCKET_MS).toISOString()}`,
  async run({ db, societyId, config, now, email }) {
    const { maxAttempts, batchSize } = parseConfig(notificationsDispatchEntry, config);
    const summary = await dispatchQueuedEmails(db, societyId, { transport: email, maxAttempts, batchSize, now });
    return { ...summary };
  },
};
