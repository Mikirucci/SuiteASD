import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { eventIdParamsSchema } from '../convocations/schema.js';
import {
  attendanceSheetSchema,
  checkInBodySchema,
  memberHistoryQuerySchema,
  memberHistorySchema,
  rangeQuerySchema,
  teamSummarySchema,
} from './schema.js';
import { checkIn, getSheet, memberHistory, teamSummary } from './service.js';

export const attendanceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/events/:eventId/attendance',
    {
      onRequest: [app.requirePermission('attendance:read')],
      schema: {
        tags: ['Attendance'],
        summary: 'Check-in sheet of a training: team athletes with present / absent / not recorded',
        security: bearerSecurity,
        params: eventIdParamsSchema,
        response: { 200: attendanceSheetSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => getSheet(tenantOf(request), request.params.eventId),
  );

  app.put(
    '/events/:eventId/attendance',
    {
      onRequest: [app.requirePermission('attendance:write')],
      schema: {
        tags: ['Attendance'],
        summary: "Quick check-in: bulk upsert of the coach's present / absent marks (idempotent)",
        security: bearerSecurity,
        params: eventIdParamsSchema,
        body: checkInBodySchema,
        response: { 200: attendanceSheetSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => checkIn(tenantOf(request), request.params.eventId, request.body),
  );

  app.get(
    '/members/:id/attendance',
    {
      onRequest: [app.requirePermission('attendance:read')],
      schema: {
        tags: ['Attendance'],
        summary: 'Attendance history of an athlete with the presence percentage (cursor pagination, newest first)',
        security: bearerSecurity,
        params: idParamsSchema,
        querystring: memberHistoryQuerySchema,
        response: { 200: memberHistorySchema, ...problemResponses(400, 401, 403, 404, 422) },
      },
    },
    async (request) => memberHistory(tenantOf(request), request.params.id, request.query),
  );

  app.get(
    '/teams/:id/attendance',
    {
      onRequest: [app.requirePermission('attendance:read')],
      schema: {
        tags: ['Attendance'],
        summary: 'Attendance summary of a team: percentage per athlete and overall',
        security: bearerSecurity,
        params: idParamsSchema,
        querystring: rangeQuerySchema,
        response: { 200: teamSummarySchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => teamSummary(tenantOf(request), request.params.id, request.query),
  );
};
