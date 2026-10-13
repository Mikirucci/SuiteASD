import type { Automation, Prisma } from '@prisma/client';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { isAutomationEnabled } from '../../jobs/event-automations.js';
import {
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationType,
} from '../../shared/enums.js';

export { NOTIFICATION_TYPES };
export type { NotificationType };

export interface CreateNotificationInput {
  societyId: string;
  userIds: readonly string[];
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  // Makes the call idempotent: a user who already has a notification with this key (per channel) gets no second one.
  dedupeKey?: string;
}

// The slice of a (tenant or transaction) Prisma client that createNotification needs.
export interface NotificationWriter {
  notification: {
    createMany(args: { data: Prisma.NotificationCreateManyInput[] }): PromiseLike<Prisma.BatchPayload>;
    findMany(args: {
      where: Prisma.NotificationWhereInput;
      select: { userId: true; channel: true };
    }): PromiseLike<{ userId: string; channel: string }[]>;
  };
  notificationPreference: {
    findMany(args: {
      where: Prisma.NotificationPreferenceWhereInput;
      select: { userId: true; channel: true; enabled: true };
    }): PromiseLike<{ userId: string; channel: string; enabled: boolean }[]>;
  };
  automation: {
    findFirst(args: { where: { key: string } }): PromiseLike<Automation | null>;
  };
}

// Key of the automation that governs outgoing notifications (see jobs/catalog.ts): while it is disabled no email
// is queued; the in-app notification center keeps working.
const DISPATCH_AUTOMATION_KEY = 'notifications-dispatch';

// Writes the notifications of one event: per recipient an in-app row (delivered at once) and an email row (queued
// for the dispatch job), unless the user switched that channel off for this type. Returns the number of rows written
// (0 when everything was filtered out or already sent under the same `dedupeKey`).
export async function createNotification(db: NotificationWriter, input: CreateNotificationInput): Promise<number> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return 0;

  const emailEnabled = await isAutomationEnabled(db, DISPATCH_AUTOMATION_KEY);
  const channels: NotificationChannel[] = emailEnabled ? ['IN_APP', 'EMAIL'] : ['IN_APP'];

  const preferences = await db.notificationPreference.findMany({
    where: { userId: { in: userIds }, type: input.type, enabled: false },
    select: { userId: true, channel: true, enabled: true },
  });
  const optedOut = new Set(preferences.map((preference) => `${preference.userId}:${preference.channel}`));

  const now = new Date();
  const candidates = userIds.flatMap((userId) =>
    channels.filter((channel) => !optedOut.has(`${userId}:${channel}`)).map((channel) => ({ userId, channel })),
  );

  // A concurrent writer may insert the same dedupe key between our check and our insert: the unique constraint
  // rejects the batch, so we re-check once and write only what is still missing.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const missing = await withoutExisting(db, candidates, input.dedupeKey);
    if (missing.length === 0) return 0;
    try {
      const result = await db.notification.createMany({
        data: missing.map(({ userId, channel }) => ({
          societyId: input.societyId,
          userId,
          type: input.type,
          channel,
          title: input.title,
          body: input.body,
          ...(input.data === undefined ? {} : { data: input.data }),
          ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
          ...(channel === 'IN_APP' ? { status: 'SENT', sentAt: now } : { status: 'PENDING' }),
        })),
      });
      return result.count;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 1) throw error;
    }
  }
  return 0;
}

async function withoutExisting(
  db: NotificationWriter,
  candidates: readonly { userId: string; channel: NotificationChannel }[],
  dedupeKey: string | undefined,
): Promise<{ userId: string; channel: NotificationChannel }[]> {
  if (dedupeKey === undefined || candidates.length === 0) return [...candidates];
  const existing = await db.notification.findMany({
    where: { dedupeKey, userId: { in: [...new Set(candidates.map((candidate) => candidate.userId))] } },
    select: { userId: true, channel: true },
  });
  const taken = new Set(existing.map((row) => `${row.userId}:${row.channel}`));
  return candidates.filter((candidate) => !taken.has(`${candidate.userId}:${candidate.channel}`));
}
