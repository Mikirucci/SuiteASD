import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { countUnread, getPreferences, listNotifications, markAllRead, markRead, updatePreferences } from './center.js';
import {
  listNotificationsQuerySchema,
  notificationSchema,
  preferencesSchema,
  readAllResultSchema,
  unreadCountSchema,
  updatePreferencesBodySchema,
} from './schema.js';

// Every route acts on the caller's own notifications: the permission is `notifications:readOwn` (all roles)
// and the services filter by the token's user id.
export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  const onRequest = [app.requirePermission('notifications:readOwn')];

  app.get(
    '/notifications',
    {
      onRequest,
      schema: {
        tags: ['Notifications'],
        summary: 'Notification center of the signed-in user, newest first (cursor pagination)',
        security: bearerSecurity,
        querystring: listNotificationsQuerySchema,
        response: { 200: pageSchema(notificationSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => listNotifications(tenantOf(request), request.query),
  );

  app.get(
    '/notifications/unread-count',
    {
      onRequest,
      schema: {
        tags: ['Notifications'],
        summary: 'Number of unread notifications (badge)',
        security: bearerSecurity,
        response: { 200: unreadCountSchema, ...problemResponses(401, 403) },
      },
    },
    async (request) => ({ count: await countUnread(tenantOf(request)) }),
  );

  app.post(
    '/notifications/read-all',
    {
      onRequest,
      schema: {
        tags: ['Notifications'],
        summary: 'Mark every notification as read',
        security: bearerSecurity,
        response: { 200: readAllResultSchema, ...problemResponses(401, 403) },
      },
    },
    async (request) => ({ updated: await markAllRead(tenantOf(request)) }),
  );

  app.post(
    '/notifications/:id/read',
    {
      onRequest,
      schema: {
        tags: ['Notifications'],
        summary: 'Mark a notification as read (idempotent)',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: notificationSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => markRead(tenantOf(request), request.params.id),
  );

  app.get(
    '/notifications/preferences',
    {
      onRequest,
      schema: {
        tags: ['Notifications'],
        summary: 'Channel preferences per notification type (all enabled unless switched off)',
        security: bearerSecurity,
        response: { 200: preferencesSchema, ...problemResponses(401, 403) },
      },
    },
    async (request) => ({ preferences: await getPreferences(tenantOf(request)) }),
  );

  app.put(
    '/notifications/preferences',
    {
      onRequest,
      schema: {
        tags: ['Notifications'],
        summary: 'Switch channels on or off per notification type (only the pairs sent are changed)',
        security: bearerSecurity,
        body: updatePreferencesBodySchema,
        response: { 200: preferencesSchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request) => ({ preferences: await updatePreferences(tenantOf(request), request.body) }),
  );
};
