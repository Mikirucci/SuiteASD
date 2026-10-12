import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  cancelEventBodySchema,
  createEventBodySchema,
  createdEventSchema,
  eventSchema,
  exportEventsQuerySchema,
  listEventsQuerySchema,
  updateEventBodySchema,
} from './schema.js';
import { cancelEvent, createEvent, deleteEvent, exportCalendar, getEvent, listEvents, updateEvent } from './service.js';

export const eventRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/events',
    {
      onRequest: [app.requirePermission('events:read')],
      schema: {
        tags: ['Events'],
        summary: 'List events by date range (week view), team, type and status',
        description:
          'Ordered by start. `from` is inclusive, `to` exclusive: for a week pass the Monday 00:00 and the next Monday 00:00 ' +
          'in the society time zone, as ISO 8601 with offset. Each event carries the convocation summary.',
        security: bearerSecurity,
        querystring: listEventsQuerySchema,
        response: { 200: pageSchema(eventSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listEvents(tenantOf(request), filters, { limit, cursor });
    },
  );

  app.get(
    '/events/export.ics',
    {
      onRequest: [app.requirePermission('events:read')],
      schema: {
        tags: ['Events'],
        summary: 'Export the calendar as iCalendar (.ics, RFC 5545)',
        description:
          'Requires the Bearer token like every endpoint: download it with an authenticated request ' +
          '(`fetch` with the Authorization header) and import the file into Google Calendar, Apple Calendar or Outlook. ' +
          'A calendar app cannot subscribe to this URL because it cannot send the header. At most 2000 events.',
        security: bearerSecurity,
        querystring: exportEventsQuerySchema,
        response: { 200: z.string().describe('text/calendar'), ...problemResponses(401, 403, 422) },
      },
    },
    async (request, reply) => {
      const calendar = await exportCalendar(tenantOf(request), request.query);
      return reply
        .type('text/calendar; charset=utf-8')
        .header('content-disposition', 'attachment; filename="calendario.ics"')
        .header('cache-control', 'private, no-store')
        .send(calendar);
    },
  );

  app.get(
    '/events/:id',
    {
      onRequest: [app.requirePermission('events:read')],
      schema: {
        tags: ['Events'],
        summary: 'Get an event',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: eventSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getEvent(tenantOf(request), request.params.id),
  );

  app.post(
    '/events',
    {
      onRequest: [app.requirePermission('events:write')],
      schema: {
        tags: ['Events'],
        summary: 'Create an event, or a weekly series of trainings with `recurrence`',
        description:
          'A recurrence repeats the training every N weeks at the same wall-clock time of the society (it stays 19:00 across ' +
          'daylight saving changes). The response is the first occurrence; the others point to it with `recurrenceParentId`.',
        security: bearerSecurity,
        body: createEventBodySchema,
        response: { 201: createdEventSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createEvent(tenantOf(request), request.body)),
  );

  app.patch(
    '/events/:id',
    {
      onRequest: [app.requirePermission('events:write')],
      schema: {
        tags: ['Events'],
        summary: 'Update an event; changing the start or the venue postpones it and notifies athletes and guardians',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateEventBodySchema,
        response: { 200: eventSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => updateEvent(tenantOf(request), request.params.id, request.body),
  );

  app.post(
    '/events/:id/cancel',
    {
      onRequest: [app.requirePermission('events:write')],
      schema: {
        tags: ['Events'],
        summary: 'Cancel an event and notify athletes and guardians',
        security: bearerSecurity,
        params: idParamsSchema,
        body: cancelEventBodySchema,
        response: { 200: eventSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => cancelEvent(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/events/:id',
    {
      onRequest: [app.requirePermission('events:write')],
      schema: {
        tags: ['Events'],
        summary: 'Delete an event with its convocations and attendance (no notification)',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      await deleteEvent(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );
};
