import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import { createTripBodySchema, listTripsQuerySchema, tripSchema, updateTripBodySchema } from './schema.js';
import { tripService } from './service.js';

export const tripRoutes: FastifyPluginAsyncZod = async (app) => {
  registerCrudRoutes(app, {
    path: '/trips',
    tag: 'Trips',
    noun: 'trip',
    permissions: { read: 'trips:read', write: 'trips:write' },
    schemas: {
      dto: tripSchema,
      createBody: createTripBodySchema,
      updateBody: updateTripBodySchema,
      listQuery: listTripsQuerySchema,
    },
    service: tripService,
  });
};
