import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  convocationSchema,
  createConvocationsBodySchema,
  eventConvocationsSchema,
  eventIdParamsSchema,
  listConvocationsQuerySchema,
  remindConvocationsResultSchema,
  respondBodySchema,
  sendConvocationsResultSchema,
} from './schema.js';
import {
  createConvocations,
  getEventConvocations,
  listConvocations,
  remindPendingConvocations,
  removeConvocation,
  respondToConvocation,
  scopeOf,
  sendConvocations,
} from './service.js';

export const convocationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/convocations',
    {
      // Athletes and guardians only get their own convocations and their children's (filtered in the service).
      onRequest: [app.requirePermission('convocations:readOwn')],
      schema: {
        tags: ['Convocations'],
        summary: 'List convocations (cursor pagination, ordered by event date)',
        description:
          'A team event convocates its eligible athletes as soon as it is created: athletes and guardians see their own ' +
          'convocation at once and can answer it, whether or not it was ever notified (`sentAt`).',
        security: bearerSecurity,
        querystring: listConvocationsQuerySchema,
        response: { 200: pageSchema(convocationSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => listConvocations(tenantOf(request), request.query),
  );

  app.get(
    '/events/:eventId/convocations',
    {
      onRequest: [app.requirePermission('convocations:readOwn')],
      schema: {
        tags: ['Convocations'],
        summary: 'Convocated athletes of an event with the "5/12 confermate" summary',
        security: bearerSecurity,
        params: eventIdParamsSchema,
        response: { 200: eventConvocationsSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getEventConvocations(tenantOf(request), request.params.eventId),
  );

  app.post(
    '/events/:eventId/convocations',
    {
      onRequest: [app.requirePermission('convocations:write')],
      schema: {
        tags: ['Convocations'],
        summary: 'Convocate athletes of the event team (capacity, eligibility, ADMIN override)',
        description:
          'Manual addition, e.g. an athlete with an expired certificate (the automatic convocation skips them). Athletes ' +
          'already convocated are skipped. An athlete with an expired medical certificate is rejected with 422 ' +
          '`member_not_eligible` unless an ADMIN sends `override.reason`. Capacity: on a team event the confirmed athletes ' +
          'plus the new ones cannot exceed the event slots, on an event without a team the rows that are not declined ' +
          'plus the new ones cannot; otherwise 409 `capacity_exceeded`.',
        security: bearerSecurity,
        params: eventIdParamsSchema,
        body: createConvocationsBodySchema,
        response: { 201: eventConvocationsSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const { result, overriddenMemberIds } = await createConvocations(
        tenantOf(request),
        request.params.eventId,
        request.body,
      );
      if (overriddenMemberIds.length > 0) {
        request.log.warn(
          { audit: 'convocation_override', eventId: request.params.eventId, memberIds: overriddenMemberIds, userId: request.auth?.userId },
          'Ineligible athletes convocated by administrator override',
        );
      }
      return reply.status(201).send(result);
    },
  );

  app.post(
    '/events/:eventId/convocations/send',
    {
      onRequest: [app.requirePermission('convocations:write')],
      schema: {
        tags: ['Convocations'],
        summary: 'Notify the convocations not notified yet (idempotent: nobody is notified twice; athletes who already answered are not asked again)',
        security: bearerSecurity,
        params: eventIdParamsSchema,
        response: { 200: sendConvocationsResultSchema, ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request) => sendConvocations(scopeOf(tenantOf(request)), request.params.eventId),
  );

  app.post(
    '/events/:eventId/convocations/remind',
    {
      onRequest: [app.requirePermission('convocations:write')],
      schema: {
        tags: ['Convocations'],
        summary: 'Remind the athletes who have not answered (at most one reminder per day)',
        security: bearerSecurity,
        params: eventIdParamsSchema,
        response: { 200: remindConvocationsResultSchema, ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request) => remindPendingConvocations(scopeOf(tenantOf(request)), request.params.eventId),
  );

  app.put(
    '/convocations/:id/response',
    {
      onRequest: [app.requirePermission('convocations:respond')],
      schema: {
        tags: ['Convocations'],
        summary: 'Confirm or decline a convocation (athlete, or guardian for a linked child)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: respondBodySchema,
        response: { 200: convocationSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => respondToConvocation(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/convocations/:id',
    {
      onRequest: [app.requirePermission('convocations:write')],
      schema: {
        tags: ['Convocations'],
        summary: 'Remove a convocation (before the event starts)',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      await removeConvocation(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );
};
