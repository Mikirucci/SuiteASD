import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  addTeamMembersBodySchema,
  addTeamMembersResultSchema,
  createTeamBodySchema,
  listTeamsQuerySchema,
  teamSchema,
  updateTeamBodySchema,
} from './schema.js';
import { addTeamMembers, createTeam, deleteTeam, getTeam, listTeams, updateTeam } from './service.js';

// REFERENCE MODULE: copy this folder to start a new one (see docs/API.md, "Adding a module").
// Route handlers stay thin: authorize (onRequest hook, before body parsing) -> validate (schema) -> call the service -> return the DTO.
export const teamRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/teams',
    {
      onRequest: [app.requirePermission('teams:read')],
      schema: {
        tags: ['Teams'],
        summary: 'List teams (cursor pagination)',
        security: bearerSecurity,
        querystring: paginationQuerySchema.extend(listTeamsQuerySchema.shape),
        response: { 200: pageSchema(teamSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listTeams(tenantOf(request), filters, { limit, cursor });
    },
  );

  app.get(
    '/teams/:id',
    {
      onRequest: [app.requirePermission('teams:read')],
      schema: {
        tags: ['Teams'],
        summary: 'Get a team',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: teamSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getTeam(tenantOf(request), request.params.id),
  );

  app.post(
    '/teams',
    {
      onRequest: [app.requirePermission('teams:write')],
      schema: {
        tags: ['Teams'],
        summary: 'Create a team',
        security: bearerSecurity,
        body: createTeamBodySchema,
        response: { 201: teamSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const team = await createTeam(tenantOf(request), request.body);
      return reply.status(201).send(team);
    },
  );

  app.patch(
    '/teams/:id',
    {
      onRequest: [app.requirePermission('teams:write')],
      schema: {
        tags: ['Teams'],
        summary: 'Update a team (partial)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateTeamBodySchema,
        response: { 200: teamSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => updateTeam(tenantOf(request), request.params.id, request.body),
  );

  app.post(
    '/teams/:id/members',
    {
      onRequest: [app.requirePermission('teams:write')],
      schema: {
        tags: ['Teams'],
        summary: 'Add members to a team in one go',
        security: bearerSecurity,
        params: idParamsSchema,
        body: addTeamMembersBodySchema,
        response: { 200: addTeamMembersResultSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => addTeamMembers(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/teams/:id',
    {
      onRequest: [app.requirePermission('teams:write')],
      schema: {
        tags: ['Teams'],
        summary: 'Delete a team',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      await deleteTeam(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );
};
