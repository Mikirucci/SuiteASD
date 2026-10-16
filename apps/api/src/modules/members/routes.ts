import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { createFileStorage } from '../documents/storage.js';
import {
  createChildBodySchema,
  createMemberBodySchema,
  exportMembersQuerySchema,
  importMembersBodySchema,
  importMembersResultSchema,
  listMembersQuerySchema,
  memberDetailSchema,
  memberListItemSchema,
  memberSummarySchema,
  updateMemberBodySchema,
  updateOwnContactBodySchema,
} from './schema.js';
import {
  createMember,
  createOwnChild,
  deleteMember,
  exportMembersCsv,
  getMember,
  getSummary,
  importMembers,
  listMembers,
  updateMember,
  updateOwnContact,
} from './service.js';

export const memberRoutes: FastifyPluginAsyncZod = async (app) => {
  const storage = createFileStorage(app.config.STORAGE_DIR);

  app.get(
    '/members/summary',
    {
      onRequest: [app.requirePermission('members:read')],
      schema: {
        tags: ['Members'],
        summary: 'Footer summary: members, teams, missing documents',
        security: bearerSecurity,
        response: { 200: memberSummarySchema, ...problemResponses(401, 403) },
      },
    },
    async (request) => getSummary(tenantOf(request)),
  );

  app.get(
    '/members/export',
    {
      onRequest: [app.requirePermission('members:write')],
      schema: {
        tags: ['Members'],
        summary: 'Export members as CSV (";" separated, UTF-8 with BOM)',
        security: bearerSecurity,
        querystring: exportMembersQuerySchema,
        response: { 200: z.string().describe('text/csv'), ...problemResponses(401, 403, 422) },
      },
    },
    async (request, reply) => {
      const csv = await exportMembersCsv(tenantOf(request), request.query);
      request.log.info({ event: 'members.export', userId: request.auth?.userId }, 'members exported');
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="tesserati.csv"')
        .header('Cache-Control', 'private, no-store')
        .send(csv);
    },
  );

  app.post(
    '/members/import',
    {
      onRequest: [app.requirePermission('members:write')],
      schema: {
        tags: ['Members'],
        summary: 'Import members from CSV text (dry run by default)',
        description:
          'Header row required (nome, cognome, dataNascita, codiceFiscale, email, telefono, squadre, ruolo, taglia...; Italian or English). ' +
          'Teams are matched by name and separated by "|". Valid rows are created, invalid ones reported with their row number.',
        security: bearerSecurity,
        body: importMembersBodySchema,
        response: { 200: importMembersResultSchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request) => importMembers(tenantOf(request), request.body),
  );

  app.get(
    '/members',
    {
      onRequest: [app.requirePermission('members:readOwn')],
      schema: {
        tags: ['Members'],
        summary: 'List members with team badges and document indicators (athletes and guardians: only their own)',
        security: bearerSecurity,
        querystring: paginationQuerySchema.extend(listMembersQuerySchema.shape),
        response: { 200: pageSchema(memberListItemSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listMembers(tenantOf(request), filters, { limit, cursor });
    },
  );

  app.get(
    '/members/:id',
    {
      onRequest: [app.requirePermission('members:readOwn')],
      schema: {
        tags: ['Members'],
        summary: 'Get a member (profile, teams, linked guardians, document indicators)',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: memberDetailSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getMember(tenantOf(request), request.params.id),
  );

  app.post(
    '/members',
    {
      onRequest: [app.requirePermission('members:write')],
      schema: {
        tags: ['Members'],
        summary: 'Create a member',
        security: bearerSecurity,
        body: createMemberBodySchema,
        response: { 201: memberDetailSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createMember(tenantOf(request), request.body)),
  );

  app.patch(
    '/members/:id',
    {
      onRequest: [app.requirePermission('members:write')],
      schema: {
        tags: ['Members'],
        summary: 'Update a member (partial; teamIds replaces the current teams)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateMemberBodySchema,
        response: { 200: memberDetailSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => updateMember(tenantOf(request), request.params.id, request.body),
  );

  app.patch(
    '/members/:id/contact',
    {
      onRequest: [app.requirePermission('members:updateOwn')],
      schema: {
        tags: ['Members'],
        summary: 'An athlete or guardian updates the contact details of their own member (email, phone, address, kit size)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateOwnContactBodySchema,
        response: { 200: memberDetailSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => updateOwnContact(tenantOf(request), request.params.id, request.body),
  );

  app.post(
    '/me/children',
    {
      onRequest: [app.requirePermission('children:create')],
      schema: {
        tags: ['Members'],
        summary: 'A guardian registers a child: the child becomes a member linked to the guardian, with no team yet',
        security: bearerSecurity,
        body: createChildBodySchema,
        response: { 201: memberDetailSchema, ...problemResponses(401, 403, 409, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createOwnChild(tenantOf(request), request.body, request.log)),
  );

  app.delete(
    '/members/:id',
    {
      onRequest: [app.requirePermission('members:write')],
      schema: {
        tags: ['Members'],
        summary: 'Delete a member with their documents and files (right to erasure)',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      await deleteMember(tenantOf(request), request.params.id, storage);
      return reply.status(204).send(null);
    },
  );
};
