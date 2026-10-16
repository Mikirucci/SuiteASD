import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { REPORT_SECTIONS, accountingReportQuerySchema, reportSummarySchema } from './schema.js';
import { buildAccountingReport, summarizeReport } from './data.js';
import { accountingReportFileName, renderAccountingPdf } from './pdf.js';

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  const onRequest = [app.requirePermission('ledger:read')];

  app.get(
    '/reports/accounting/summary',
    {
      onRequest,
      schema: {
        tags: ['Reports'],
        summary: 'What the accounting report would contain for a period, section by section',
        security: bearerSecurity,
        querystring: accountingReportQuerySchema,
        response: { 200: reportSummarySchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request) => {
      const report = await buildAccountingReport(tenantOf(request), request.query);
      return summarizeReport(report, request.query);
    },
  );

  app.get(
    '/reports/accounting.pdf',
    {
      onRequest,
      schema: {
        tags: ['Reports'],
        summary: 'PDF report for the accountant: all the money sections together, or only the chosen ones',
        description:
          `Sections: ${REPORT_SECTIONS.join(', ')} (comma separated in "sections"; default all). ` +
          'The period runs from "from" to "to", both days included.',
        security: bearerSecurity,
        querystring: accountingReportQuerySchema,
        response: { 200: z.unknown().describe('application/pdf'), ...problemResponses(401, 403, 422) },
      },
    },
    async (request, reply) => {
      const report = await buildAccountingReport(tenantOf(request), request.query);
      const pdf = await renderAccountingPdf(report);
      request.log.info(
        { event: 'report.accounting', userId: request.auth?.userId, sections: request.query.sections },
        'accounting report generated',
      );
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Length', pdf.length)
        .header('Content-Disposition', `attachment; filename="${accountingReportFileName(report, request.query.sections.length)}"`)
        .header('Cache-Control', 'private, no-store')
        .send(pdf);
    },
  );
};
