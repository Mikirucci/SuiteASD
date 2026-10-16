import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { enrolBodySchema, joinCodeParamsSchema, joinInfoSchema } from '../enrolment/schema.js';
import { authRateLimit } from '../../plugins/security.js';
import { createJoinService } from './join-service.js';
import { sessionResponseSchema } from './schema.js';

export const joinRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createJoinService({
    prisma: app.prisma,
    config: app.config,
    passwords: app.passwords,
    log: app.log,
  });

  app.get(
    '/join/:code',
    {
      schema: {
        tags: ['Enrolment'],
        summary: 'What an enrolment link is for: the society and the team (public)',
        params: joinCodeParamsSchema,
        response: { 200: joinInfoSchema, ...problemResponses(404, 410, 422) },
      },
    },
    async (request) => service.describe(request.params.code),
  );

  app.post(
    '/join/:code',
    {
      config: authRateLimit(app),
      schema: {
        tags: ['Enrolment'],
        summary: 'Enrol with a link: creates the account and the member, and signs the person in (public)',
        description:
          'No approval step: the member exists at once, in the link\'s team. ATLETA under 14 is refused (a guardian ' +
          'has to enrol them). An email that already has an account must send its current password.',
        params: joinCodeParamsSchema,
        body: enrolBodySchema,
        response: { 201: sessionResponseSchema, ...problemResponses(401, 404, 409, 410, 422, 429) },
      },
    },
    async (request, reply) => {
      const session = await service.enrol(request.params.code, request.body, request.headers['user-agent']);
      return reply.status(201).send(session);
    },
  );
};
