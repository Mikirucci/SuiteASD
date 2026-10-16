import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  createLedgerEntryBodySchema,
  ledgerEntrySchema,
  ledgerReportQuerySchema,
  ledgerReportSchema,
  listLedgerEntriesQuerySchema,
  updateLedgerEntryBodySchema,
} from './schema.js';
import { getLedgerReport, ledgerService } from './service.js';

export const ledgerRoutes: FastifyPluginAsyncZod = async (app) => {
  registerCrudRoutes(app, {
    path: '/ledger/entries',
    tag: 'Ledger',
    noun: 'ledger entry',
    permissions: { read: 'ledger:read', write: 'ledger:write' },
    attachmentType: 'LEDGER_ENTRY',
    schemas: {
      dto: ledgerEntrySchema,
      createBody: createLedgerEntryBodySchema,
      updateBody: updateLedgerEntryBodySchema,
      listQuery: listLedgerEntriesQuerySchema,
    },
    service: ledgerService,
  });

  app.get(
    '/ledger/report',
    {
      onRequest: [app.requirePermission('ledger:read')],
      schema: {
        tags: ['Ledger'],
        summary: 'Yearly report: totals, per month and per category',
        security: bearerSecurity,
        querystring: ledgerReportQuerySchema,
        response: { 200: ledgerReportSchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request) => getLedgerReport(tenantOf(request), request.query),
  );
};
