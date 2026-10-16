import type { Notification, Prisma } from '@prisma/client';
import { notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { NOTIFICATION_CHANNELS, notificationTypeSchema, notificationTypesForRoles } from '../../shared/enums.js';
import type { ListNotificationsQuery, NotificationDto, PreferenceDto, UpdatePreferencesBody } from './schema.js';

// The notification center of the signed-in user (SPEC 07 "in-app"): only their own in-app rows, never anybody else's.

function toDto(row: Notification): NotificationDto {
  const data = row.data;
  return {
    id: row.id,
    type: notificationTypeSchema.parse(row.type),
    title: row.title,
    body: row.body,
    data: typeof data === 'object' && data !== null && !Array.isArray(data) ? data : null,
    readAt: toIsoOrNull(row.readAt),
    createdAt: toIso(row.createdAt),
  };
}

// Only the types the user's roles take part in: rows written before a role change stay hidden rather than confusing.
function ownInApp({ auth }: TenantRequestContext): Prisma.NotificationWhereInput {
  return { userId: auth.userId, channel: 'IN_APP', type: { in: [...notificationTypesForRoles(auth.roles)] } };
}

export async function listNotifications(
  ctx: TenantRequestContext,
  query: ListNotificationsQuery,
): Promise<Page<NotificationDto>> {
  const rows = await ctx.db.notification.findMany({
    where: {
      ...ownInApp(ctx),
      ...(query.unread ? { readAt: null } : {}),
      ...(query.type ? { AND: [{ type: query.type }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toDto), page: page.page };
}

export async function countUnread(ctx: TenantRequestContext): Promise<number> {
  return ctx.db.notification.count({ where: { ...ownInApp(ctx), readAt: null } });
}

// Idempotent: reading an already read notification keeps its first read time.
export async function markRead(ctx: TenantRequestContext, id: string): Promise<NotificationDto> {
  const own = { id, ...ownInApp(ctx) };
  await ctx.db.notification.updateMany({ where: { ...own, readAt: null }, data: { readAt: new Date() } });
  const row = await ctx.db.notification.findFirst({ where: own });
  if (!row) throw notFound('Notification');
  return toDto(row);
}

export async function markAllRead(ctx: TenantRequestContext): Promise<number> {
  const result = await ctx.db.notification.updateMany({
    where: { ...ownInApp(ctx), readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

// Every (type, channel) pair is listed; a pair without a stored row is enabled (opt-out model).
export async function getPreferences(ctx: TenantRequestContext): Promise<PreferenceDto[]> {
  const stored = await ctx.db.notificationPreference.findMany({ where: { userId: ctx.auth.userId } });
  const disabled = new Set(stored.filter((row) => !row.enabled).map((row) => `${row.type}:${row.channel}`));
  return notificationTypesForRoles(ctx.auth.roles).flatMap((type) =>
    NOTIFICATION_CHANNELS.map((channel) => ({ type, channel, enabled: !disabled.has(`${type}:${channel}`) })),
  );
}

export async function updatePreferences(ctx: TenantRequestContext, body: UpdatePreferencesBody): Promise<PreferenceDto[]> {
  const { db, auth } = ctx;
  const available = notificationTypesForRoles(auth.roles);
  const unavailable = body.preferences.find(({ type }) => !available.includes(type));
  if (unavailable) {
    throw unprocessable('notification_type_unavailable', `The notification type ${unavailable.type} does not apply to your role`);
  }
  for (const { type, channel, enabled } of body.preferences) {
    await db.notificationPreference.upsert({
      where: { userId_societyId_type_channel: { userId: auth.userId, societyId: auth.societyId, type, channel } },
      create: { societyId: auth.societyId, userId: auth.userId, type, channel, enabled },
      update: { enabled },
    });
  }
  return getPreferences(ctx);
}
