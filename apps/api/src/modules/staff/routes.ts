import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import { createStaffBodySchema, listStaffQuerySchema, staffSchema, updateStaffBodySchema } from './schema.js';
import { staffService } from './service.js';

export const staffRoutes: FastifyPluginAsyncZod = async (app) => {
  registerCrudRoutes(app, {
    path: '/staff',
    tag: 'Staff',
    noun: 'staff member',
    permissions: { read: 'staff:read', write: 'staff:write' },
    attachmentType: 'STAFF_MEMBER',
    schemas: {
      dto: staffSchema,
      createBody: createStaffBodySchema,
      updateBody: updateStaffBodySchema,
      listQuery: listStaffQuerySchema,
    },
    service: staffService,
  });
};
