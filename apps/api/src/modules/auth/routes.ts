import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { authRateLimit } from '../../plugins/security.js';
import {
  acceptInvitationBodySchema,
  loginBodySchema,
  logoutBodySchema,
  meResponseSchema,
  refreshBodySchema,
  registerBodySchema,
  sessionResponseSchema,
} from './schema.js';
import { createAuthService } from './service.js';

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createAuthService({ prisma: app.prisma, config: app.config, passwords: app.passwords });

  app.post(
    '/auth/register',
    {
      config: authRateLimit(app),
      schema: {
        tags: ['Auth'],
        summary: 'Create a society and its first administrator',
        body: registerBodySchema,
        response: { 201: sessionResponseSchema, ...problemResponses(409, 422, 429) },
      },
    },
    async (request, reply) => {
      const session = await service.register(request.body, request.headers['user-agent']);
      return reply.status(201).send(session);
    },
  );

  app.post(
    '/auth/login',
    {
      config: authRateLimit(app),
      schema: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        body: loginBodySchema,
        response: { 200: sessionResponseSchema, ...problemResponses(401, 422, 429) },
      },
    },
    async (request) => service.login(request.body, request.headers['user-agent']),
  );

  app.post(
    '/auth/refresh',
    {
      config: authRateLimit(app),
      schema: {
        tags: ['Auth'],
        summary: 'Exchange a refresh token for a new access + refresh token pair (rotation)',
        description: 'Each refresh token is single use. Re-using a rotated token revokes the whole session family.',
        body: refreshBodySchema,
        response: { 200: sessionResponseSchema, ...problemResponses(401, 422, 429) },
      },
    },
    async (request) => service.refresh(request.body.refreshToken, request.headers['user-agent']),
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Revoke the session identified by a refresh token (idempotent)',
        body: logoutBodySchema,
        response: { 204: z.null(), ...problemResponses(422) },
      },
    },
    async (request, reply) => {
      await service.logout(request.body.refreshToken);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/invitations/accept',
    {
      config: authRateLimit(app),
      schema: {
        tags: ['Auth'],
        summary: 'Accept an invitation: creates the account if needed and joins the society',
        body: acceptInvitationBodySchema,
        response: { 200: sessionResponseSchema, ...problemResponses(401, 409, 422, 429) },
      },
    },
    async (request) => service.acceptInvitation(request.body, request.headers['user-agent']),
  );

  app.get(
    '/me',
    {
      onRequest: [app.requireAuth],
      schema: {
        tags: ['Auth'],
        summary: 'Current user, society, roles, permissions and linked athletes',
        security: bearerSecurity,
        response: { 200: meResponseSchema, ...problemResponses(401) },
      },
    },
    async (request) => service.me(tenantOf(request).auth),
  );
};
