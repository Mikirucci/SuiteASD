import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { problemResponses } from '../../lib/errors.js';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  createLedgerEntryBodySchema,
  ledgerCategoriesSchema,
  ledgerEntrySchema,
  ledgerReportQuerySchema,
  ledgerReportSchema,
  ledgerSummaryQuerySchema,
  ledgerSummarySchema,
  listLedgerCategoriesQuerySchema,
  listLedgerEntriesQuerySchema,
  updateLedgerEntryBodySchema,
} from './schema.js';
import { getLedgerCategories, getLedgerReport, getLedgerSummary, ledgerService } from './service.js';

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
    '/ledger/categories',
    {
      onRequest: [app.requirePermission('ledger:read')],
      schema: {
        tags: ['Ledger'],
        summary: 'Categories to offer when entering an income or an expense: the ones in use plus the usual ones',
        security: bearerSecurity,
        querystring: listLedgerCategoriesQuerySchema,
        response: { 200: ledgerCategoriesSchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request) => getLedgerCategories(tenantOf(request), request.query),
  );

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
  app.get(
    '/ledger/summary',
    {
      onRequest: [app.requirePermission('ledger:read')],
      schema: {
        tags: ['Ledger'],
        summary: 'Totals of the incomes or of the expenses of any period: by origin and per category',
        security: bearerSecurity,
        querystring: ledgerSummaryQuerySchema,
        response: { 200: ledgerSummarySchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request) => getLedgerSummary(tenantOf(request), request.query),
  );
};
