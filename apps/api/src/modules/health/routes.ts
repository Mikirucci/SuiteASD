import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { healthResponseSchema } from './schema.js';
import { checkHealth } from './service.js';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['Health'],
        summary: 'Liveness and database readiness probe',
        response: { 200: healthResponseSchema, ...problemResponses(503) },
      },
    },
    async (_request, reply) => {
      const health = await checkHealth(app.prisma);
      return reply.status(health.status === 'ok' ? 200 : 503).send(health);
    },
  );
};
