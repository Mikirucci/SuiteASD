import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import {
  createVenueBodySchema,
  listVenuesQuerySchema,
  updateVenueBodySchema,
  venueSchema,
} from './schema.js';
import { venueService } from './service.js';

export const venueRoutes: FastifyPluginAsyncZod = async (app) => {
  registerCrudRoutes(app, {
    path: '/venues',
    tag: 'Venues',
    noun: 'venue',
    permissions: { read: 'venues:read', write: 'venues:write' },
    attachmentType: 'VENUE',
    schemas: {
      dto: venueSchema,
      createBody: createVenueBodySchema,
      updateBody: updateVenueBodySchema,
      listQuery: listVenuesQuerySchema,
    },
    service: venueService,
  });
};
