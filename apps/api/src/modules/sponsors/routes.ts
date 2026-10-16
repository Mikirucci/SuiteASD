import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import {
  createSponsorBodySchema,
  listSponsorsQuerySchema,
  sponsorSchema,
  updateSponsorBodySchema,
} from './schema.js';
import { sponsorService } from './service.js';

export const sponsorRoutes: FastifyPluginAsyncZod = async (app) => {
  registerCrudRoutes(app, {
    path: '/sponsors',
    tag: 'Sponsors',
    noun: 'sponsor',
    permissions: { read: 'sponsors:read', write: 'sponsors:write' },
    attachmentType: 'SPONSOR',
    schemas: {
      dto: sponsorSchema,
      createBody: createSponsorBodySchema,
      updateBody: updateSponsorBodySchema,
      listQuery: listSponsorsQuerySchema,
    },
    service: sponsorService,
  });
};
