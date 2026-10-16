import type { AutomationDefinition } from '../registry.js';
import { adminDigest } from './admin-digest.js';
import { certificateReminders } from './certificate-reminders.js';
import { convocationDispatch } from './convocation-dispatch.js';
import { feeReminders } from './fee-reminders.js';
import { housekeeping } from './housekeeping.js';
import { missingDocuments } from './missing-documents.js';
import { notificationsDispatch } from './notifications-dispatch.js';
import { sponsorExpiry } from './sponsor-expiry.js';

// One line per automation. Each automation lives in its own file in this folder.
export const builtInAutomations: readonly AutomationDefinition[] = [
  housekeeping,
  certificateReminders,
  missingDocuments,
  feeReminders,
  convocationDispatch,
  notificationsDispatch,
  adminDigest,
  sponsorExpiry,
];
