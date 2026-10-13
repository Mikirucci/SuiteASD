import type { AutomationDefinition } from '../registry.js';
import { certificateReminders } from './certificate-reminders.js';
import { feeReminders } from './fee-reminders.js';
import { housekeeping } from './housekeeping.js';
import { notificationsDispatch } from './notifications-dispatch.js';

// One line per automation. Each automation lives in its own file in this folder.
export const builtInAutomations: readonly AutomationDefinition[] = [
  housekeeping,
  certificateReminders,
  feeReminders,
  notificationsDispatch,
];
