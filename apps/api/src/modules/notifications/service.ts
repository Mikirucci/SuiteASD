import type { Prisma } from '@prisma/client';

export const NOTIFICATION_TYPES = [
  'CONVOCATION',
  'FEE_DUE',
  'CERTIFICATE_EXPIRING',
  'EVENT_CHANGED',
  'EVALUATION_PUBLISHED',
  'ANNOUNCEMENT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface CreateNotificationInput {
  societyId: string;
  userIds: readonly string[];
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

// The slice of a (tenant or transaction) Prisma client that createNotification needs.
export interface NotificationWriter {
  notification: {
    createMany(args: { data: Prisma.NotificationCreateManyInput[] }): PromiseLike<Prisma.BatchPayload>;
  };
}

// Writes one in-app notification (status PENDING) per recipient; accepts a tenant client or a transaction.
export async function createNotification(
  db: NotificationWriter,
  input: CreateNotificationInput,
): Promise<number> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return 0;
  const result = await db.notification.createMany({
    data: userIds.map((userId) => ({
      societyId: input.societyId,
      userId,
      type: input.type,
      channel: 'IN_APP',
      title: input.title,
      body: input.body,
      ...(input.data === undefined ? {} : { data: input.data }),
    })),
  });
  return result.count;
}
