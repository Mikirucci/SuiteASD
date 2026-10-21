import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import { problemResponses } from '../../lib/errors.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { createKitBodySchema, kitGroupsSchema, kitSchema, listKitsQuerySchema, updateKitBodySchema } from './schema.js';
import { kitService, listKitGroups } from './service.js';

export const kitRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/kits/groups',
    {
      onRequest: [app.requirePermission('kits:read')],
      schema: {
        tags: ['Kits'],
        summary: 'Kit items grouped by name: pieces, assigned, in stock and cost of each group',
        security: bearerSecurity,
        response: { 200: kitGroupsSchema, ...problemResponses(401, 403) },
      },
    },
    async (request) => listKitGroups(tenantOf(request)),
  );

  registerCrudRoutes(app, {
    path: '/kits',
    tag: 'Kits',
    noun: 'kit',
    permissions: { read: 'kits:read', write: 'kits:write' },
    attachmentType: 'KIT',
    schemas: {
      dto: kitSchema,
      createBody: createKitBodySchema,
      updateBody: updateKitBodySchema,
      listQuery: listKitsQuerySchema,
    },
    service: kitService,
  });
};
