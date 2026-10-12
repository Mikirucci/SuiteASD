import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { createInvitationBodySchema, createdInvitationSchema, invitationSchema } from './schema.js';
import { createInvitation, listInvitations, revokeInvitation } from './service.js';

export const invitationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/invitations',
    {
      onRequest: [app.requirePermission('invitations:write')],
      schema: {
        tags: ['Invitations'],
        summary: 'Invite a person to the society with a role',
        security: bearerSecurity,
        body: createInvitationBodySchema,
        response: { 201: createdInvitationSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request, reply) => {
      const invitation = await createInvitation(tenantOf(request), app.config, request.body);
      return reply.status(201).send(invitation);
    },
  );

  app.get(
    '/invitations',
    {
      onRequest: [app.requirePermission('invitations:read')],
      schema: {
        tags: ['Invitations'],
        summary: 'List pending invitations',
        security: bearerSecurity,
        querystring: paginationQuerySchema,
        response: { 200: pageSchema(invitationSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => listInvitations(tenantOf(request), request.query),
  );

  app.delete(
    '/invitations/:id',
    {
      onRequest: [app.requirePermission('invitations:write')],
      schema: {
        tags: ['Invitations'],
        summary: 'Revoke a pending invitation',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      await revokeInvitation(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );
};
