import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema } from '../../lib/pagination.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  automationDashboardSchema,
  automationKeyParamsSchema,
  automationRunSchema,
  automationSchema,
  listRunsQuerySchema,
  updateAutomationBodySchema,
} from './schema.js';
import { getDashboard, listRuns, runNow, updateAutomation } from './service.js';

export const automationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/automations',
    {
      onRequest: [app.requirePermission('automations:read')],
      schema: {
        tags: ['Automations'],
        summary: 'Dashboard of the activities managed by the app, with the percentage of active automations',
        description: 'Fixed list of the six activities of SPEC 08 (not paginated).',
        security: bearerSecurity,
        response: { 200: automationDashboardSchema, ...problemResponses(401, 403) },
      },
    },
    async (request) => getDashboard(tenantOf(request)),
  );

  app.patch(
    '/automations/:key',
    {
      onRequest: [app.requirePermission('automations:write')],
      schema: {
        tags: ['Automations'],
        summary: 'Switch an automation on/off and/or change its settings (validated per key)',
        security: bearerSecurity,
        params: automationKeyParamsSchema,
        body: updateAutomationBodySchema,
        response: { 200: automationSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => updateAutomation(tenantOf(request), request.params.key, request.body),
  );

  app.get(
    '/automations/:key/runs',
    {
      onRequest: [app.requirePermission('automations:read')],
      schema: {
        tags: ['Automations'],
        summary: 'Execution log of an automation, newest first (cursor pagination)',
        security: bearerSecurity,
        params: automationKeyParamsSchema,
        querystring: listRunsQuerySchema,
        response: { 200: pageSchema(automationRunSchema), ...problemResponses(400, 401, 403, 404, 422) },
      },
    },
    async (request) => listRuns(tenantOf(request), request.params.key, request.query),
  );

  app.post(
    '/automations/:key/run',
    {
      onRequest: [app.requirePermission('automations:write')],
      schema: {
        tags: ['Automations'],
        summary: 'Run a scheduled automation now (admins only) and return its log entry',
        security: bearerSecurity,
        params: automationKeyParamsSchema,
        response: { 200: automationRunSchema, ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request) => runNow(app, tenantOf(request), request.params.key),
  );
};
