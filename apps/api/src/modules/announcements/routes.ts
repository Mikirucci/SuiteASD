import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import {
  announcementSchema,
  createAnnouncementBodySchema,
  listAnnouncementsQuerySchema,
  updateAnnouncementBodySchema,
} from './schema.js';
import { announcementService } from './service.js';

export const announcementRoutes: FastifyPluginAsyncZod = async (app) => {
  registerCrudRoutes(app, {
    path: '/announcements',
    tag: 'Announcements',
    noun: 'announcement',
    permissions: { read: 'announcements:read', write: 'announcements:write' },
    schemas: {
      dto: announcementSchema,
      createBody: createAnnouncementBodySchema,
      updateBody: updateAnnouncementBodySchema,
      listQuery: listAnnouncementsQuerySchema,
    },
    service: announcementService,
  });
};
