import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { statisticsOverviewSchema } from './schema.js';
import { getOverview } from './service.js';

export const statisticsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/statistics/overview',
    {
      onRequest: [app.requirePermission('statistics:read')],
      schema: {
        tags: ['Statistics'],
        summary: 'Society dashboard: members per team, certificates, fees, attendance, next events, latest results',
        security: bearerSecurity,
        response: { 200: statisticsOverviewSchema, ...problemResponses(401, 403) },
      },
    },
    async (request) => getOverview(tenantOf(request)),
  );
};
