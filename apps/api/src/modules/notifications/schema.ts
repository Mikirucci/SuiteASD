import { z } from 'zod';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { notificationChannelSchema, notificationTypeSchema } from '../../shared/enums.js';

const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unread: queryBoolean.optional().describe('true: only notifications not read yet'),
  type: notificationTypeSchema.optional(),
});

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  // Free-form references to the subject (event id, payment id...) so a client can deep-link.
  data: z.record(z.string(), z.unknown()).nullable(),
  readAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const unreadCountSchema = z.object({ count: z.number().int() });

export const readAllResultSchema = z.object({ updated: z.number().int() });

export const preferenceSchema = z.object({
  type: notificationTypeSchema,
  channel: notificationChannelSchema,
  enabled: z.boolean(),
});

export const preferencesSchema = z.object({ preferences: z.array(preferenceSchema) });

export const updatePreferencesBodySchema = z.object({
  preferences: z
    .array(preferenceSchema)
    .min(1)
    .max(24)
    .refine((items) => new Set(items.map((item) => `${item.type}:${item.channel}`)).size === items.length, {
      message: 'Each type and channel pair can appear only once',
    }),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type NotificationDto = z.infer<typeof notificationSchema>;
export type PreferenceDto = z.infer<typeof preferenceSchema>;
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesBodySchema>;
