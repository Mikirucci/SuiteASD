import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { listUsersQuerySchema, userListItemSchema } from './schema.js';
import { listUsers } from './service.js';

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/users',
    {
      onRequest: [app.requirePermission('users:read')],
      schema: {
        tags: ['Users'],
        summary: 'List the accounts of the society with their roles',
        security: bearerSecurity,
        querystring: paginationQuerySchema.extend(listUsersQuerySchema.shape),
        response: { 200: pageSchema(userListItemSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listUsers(tenantOf(request), filters, { limit, cursor });
    },
  );
};
