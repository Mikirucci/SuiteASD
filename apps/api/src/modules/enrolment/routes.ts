import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { createJoinLinkBodySchema, joinLinkSchema } from './schema.js';
import { createJoinLink, listJoinLinks, revokeJoinLink } from './service.js';

export const enrolmentRoutes: FastifyPluginAsyncZod = async (app) => {
  // ---- Administration -----------------------------------------------------------------------------------------

  app.post(
    '/join-links',
    {
      onRequest: [app.requirePermission('joinLinks:write')],
      schema: {
        tags: ['Enrolment'],
        summary: 'Create an enrolment link (optionally for one team, with an expiry and a maximum number of uses)',
        security: bearerSecurity,
        body: createJoinLinkBodySchema,
        response: { 201: joinLinkSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createJoinLink(tenantOf(request), app.config, request.body)),
  );

  app.get(
    '/join-links',
    {
      onRequest: [app.requirePermission('joinLinks:read')],
      schema: {
        tags: ['Enrolment'],
        summary: 'List the enrolment links with their use count and status',
        security: bearerSecurity,
        querystring: paginationQuerySchema,
        response: { 200: pageSchema(joinLinkSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => listJoinLinks(tenantOf(request), app.config, request.query),
  );

  app.delete(
    '/join-links/:id',
    {
      onRequest: [app.requirePermission('joinLinks:write')],
      schema: {
        tags: ['Enrolment'],
        summary: 'Revoke an enrolment link: it stops working at once, the people who enrolled are unaffected',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      await revokeJoinLink(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );
};
