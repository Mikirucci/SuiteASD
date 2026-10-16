import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { authRateLimit } from '../../plugins/security.js';
import { sessionResponseSchema } from '../auth/schema.js';
import {
  createJoinLinkBodySchema,
  enrolBodySchema,
  joinCodeParamsSchema,
  joinInfoSchema,
  joinLinkSchema,
} from './schema.js';
import { createEnrolmentService, createJoinLink, listJoinLinks, revokeJoinLink } from './service.js';

export const enrolmentRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createEnrolmentService({
    prisma: app.prisma,
    config: app.config,
    passwords: app.passwords,
    log: app.log,
  });

  // ---- Administration -----------------------------------------------------------------------------------------

  app.post(
    '/join-links',
    {
      onRequest: [app.requirePermission('joinLinks:write')],
      schema: {
        tags: ['Enrolment'],
        summary: 'Create an enrolment link (optionally for one team, with an expiry and a maximum number of uses)',
        security: bearerSecurity,
        body: createJoinLinkBodySchema,
        response: { 201: joinLinkSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createJoinLink(tenantOf(request), app.config, request.body)),
  );

  app.get(
    '/join-links',
    {
      onRequest: [app.requirePermission('joinLinks:read')],
      schema: {
        tags: ['Enrolment'],
        summary: 'List the enrolment links with their use count and status',
        security: bearerSecurity,
        querystring: paginationQuerySchema,
        response: { 200: pageSchema(joinLinkSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => listJoinLinks(tenantOf(request), app.config, request.query),
  );

  app.delete(
    '/join-links/:id',
    {
      onRequest: [app.requirePermission('joinLinks:write')],
      schema: {
        tags: ['Enrolment'],
        summary: 'Revoke an enrolment link: it stops working at once, the people who enrolled are unaffected',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      await revokeJoinLink(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );

  // ---- Public: the person who opens the link ------------------------------------------------------------------

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
