import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { deviceSchema, registerDeviceBodySchema } from './schema.js';
import { registerDevice } from './service.js';

export const deviceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/devices',
    {
      onRequest: [app.requirePermission('devices:write')],
      schema: {
        tags: ['Devices'],
        summary: 'Register (or refresh) the push token of the current device',
        description: 'Idempotent: registering the same token again updates it. Native push delivery comes later.',
        security: bearerSecurity,
        body: registerDeviceBodySchema,
        response: { 201: deviceSchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request, reply) => {
      const device = await registerDevice(app.prisma, tenantOf(request).auth, request.body);
      return reply.status(201).send(device);
    },
  );
};
