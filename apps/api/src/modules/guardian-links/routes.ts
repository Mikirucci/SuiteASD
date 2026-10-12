import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  createGuardianLinkBodySchema,
  guardianLinkSchema,
  listGuardianLinksQuerySchema,
} from './schema.js';
import { createGuardianLink, deleteGuardianLink, listGuardianLinks } from './service.js';

export const guardianLinkRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/guardian-links',
    {
      onRequest: [app.requirePermission('guardianLinks:write')],
      schema: {
        tags: ['Guardian links'],
        summary: 'Link a guardian (GENITORE account) to an athlete',
        security: bearerSecurity,
        body: createGuardianLinkBodySchema,
        response: { 201: guardianLinkSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const link = await createGuardianLink(tenantOf(request), request.body);
      return reply.status(201).send(link);
    },
  );

  app.get(
    '/guardian-links',
    {
      onRequest: [app.requirePermission('guardianLinks:read')],
      schema: {
        tags: ['Guardian links'],
        summary: 'List guardian-athlete links',
        security: bearerSecurity,
        querystring: paginationQuerySchema.extend(listGuardianLinksQuerySchema.shape),
        response: { 200: pageSchema(guardianLinkSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listGuardianLinks(tenantOf(request), filters, { limit, cursor });
    },
  );

  app.delete(
    '/guardian-links/:id',
    {
      onRequest: [app.requirePermission('guardianLinks:write')],
      schema: {
        tags: ['Guardian links'],
        summary: 'Remove a guardian-athlete link',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      await deleteGuardianLink(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );
};
