import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import { createKitBodySchema, kitSchema, listKitsQuerySchema, updateKitBodySchema } from './schema.js';
import { kitService } from './service.js';

export const kitRoutes: FastifyPluginAsyncZod = async (app) => {
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
