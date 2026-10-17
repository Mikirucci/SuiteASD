import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import { problemResponses } from '../../lib/errors.js';
import { idempotencyKeyHeaderSchema } from '../../lib/idempotency.js';
import { pageSchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { z } from 'zod';
import {
  createFeeBodySchema,
  createFeePlanBodySchema,
  feePlanSchema,
  feeSchema,
  feesSummaryQuerySchema,
  feesSummarySchema,
  generateFeesBodySchema,
  generateFeesResultSchema,
  listFeePlansQuerySchema,
  listFeesQuerySchema,
  payFeeBodySchema,
  updateFeePlanBodySchema,
} from './schema.js';
import {
  alertPaymentClaimed,
  claimPayment,
  createFee,
  feePlanService,
  feesSummary,
  generateFees,
  getFee,
  getReceiptFile,
  issueReceipt,
  listFees,
  alertPaymentReceived,
  notifyReceiptIssued,
  payFee,
} from './service.js';

// application/pdf body: Fastify sends a Buffer as is; the schema only documents it in OpenAPI.
const binaryResponseSchema = z.custom<Buffer>((value) => Buffer.isBuffer(value)).meta({ type: 'string', format: 'binary' });

export const feeRoutes: FastifyPluginAsyncZod = async (app) => {
  registerCrudRoutes(app, {
    path: '/fee-plans',
    tag: 'Fees',
    noun: 'fee plan',
    permissions: { read: 'payments:read', write: 'payments:write' },
    schemas: {
      dto: feePlanSchema,
      createBody: createFeePlanBodySchema,
      updateBody: updateFeePlanBodySchema,
      listQuery: listFeePlansQuerySchema,
    },
    service: feePlanService,
  });

  app.post(
    '/fee-plans/:id/generate',
    {
      onRequest: [app.requirePermission('payments:write')],
      schema: {
        tags: ['Fees'],
        summary: 'Generate the fees of a plan for its members (idempotent per member and due date)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: generateFeesBodySchema,
        response: { 200: generateFeesResultSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => generateFees(tenantOf(request), request.params.id, request.body),
  );

  // Declared before `/fees/:id` for readability; the router prefers static segments anyway.
  app.get(
    '/fees/summary',
    {
      onRequest: [app.requirePermission('payments:read')],
      schema: {
        tags: ['Fees'],
        summary: 'Totals: collected, to collect, reminders sent',
        security: bearerSecurity,
        querystring: feesSummaryQuerySchema,
        response: { 200: feesSummarySchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request) => feesSummary(tenantOf(request), request.query),
  );

  app.get(
    '/fees',
    {
      // Athletes and guardians get only their own / their children's fees (filtered in the service).
      onRequest: [app.requirePermission('payments:readOwn')],
      schema: {
        tags: ['Fees'],
        summary: 'List fees with status Pagato / In attesa / Scaduto (cursor pagination)',
        security: bearerSecurity,
        querystring: listFeesQuerySchema,
        response: { 200: pageSchema(feeSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listFees(tenantOf(request), filters, { limit, cursor });
    },
  );

  app.get(
    '/fees/:id',
    {
      onRequest: [app.requirePermission('payments:readOwn')],
      schema: {
        tags: ['Fees'],
        summary: 'Get a fee',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: feeSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getFee(tenantOf(request), request.params.id),
  );

  app.post(
    '/fees',
    {
      onRequest: [app.requirePermission('payments:write')],
      schema: {
        tags: ['Fees'],
        summary: 'Create a single fee (extra or manual)',
        security: bearerSecurity,
        body: createFeeBodySchema,
        response: { 201: feeSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createFee(tenantOf(request), request.body)),
  );

  app.post(
    '/fees/:id/pay',
    {
      onRequest: [app.requirePermission('payments:write')],
      schema: {
        tags: ['Fees'],
        summary: 'Register a payment and issue the numbered receipt (requires Idempotency-Key)',
        description:
          'The same Idempotency-Key with the same body replays the first response (header `Idempotent-Replayed: true`); ' +
          'with a different body it is rejected with 422 `idempotency_key_reused`.',
        security: bearerSecurity,
        headers: idempotencyKeyHeaderSchema,
        params: idParamsSchema,
        body: payFeeBodySchema,
        response: { 200: feeSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const ctx = tenantOf(request);
      const outcome = await payFee(ctx, request.params.id, request.body, request.headers['idempotency-key']);
      if (outcome.replayed) void reply.header('idempotent-replayed', 'true');
      else {
        await alertPaymentReceived(ctx, outcome.body, request.log);
        await notifyReceiptIssued(ctx, outcome.body, request.log);
      }
      return reply.status(200).send(outcome.body);
    },
  );

  app.post(
    '/fees/:id/claim-payment',
    {
      onRequest: [app.requirePermission('payments:claim')],
      schema: {
        tags: ['Fees'],
        summary: 'Report that a fee of the user or of their children has been paid ("Ho pagato")',
        description:
          'Sets `claimedAt` and notifies the administration, who checks the bank and records the payment. ' +
          'Idempotent: repeating it answers 200 with the fee unchanged and notifies nobody. The status does not change.',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: feeSchema, ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request) => {
      const ctx = tenantOf(request);
      const { fee, firstClaim } = await claimPayment(ctx, request.params.id);
      if (firstClaim) await alertPaymentClaimed(ctx, fee, request.log);
      return fee;
    },
  );

  app.post(
    '/fees/:id/receipt',
    {
      onRequest: [app.requirePermission('payments:write')],
      schema: {
        tags: ['Fees'],
        summary: 'Issue the receipt of a paid fee by hand (when the receipts automation was off) and notify it',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 201: feeSchema, ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      const ctx = tenantOf(request);
      await notifyReceiptIssued(ctx, await issueReceipt(ctx, request.params.id), request.log);
      return reply.status(201).send(await getFee(ctx, request.params.id));
    },
  );

  app.get(
    '/fees/:id/receipt',
    {
      onRequest: [app.requirePermission('payments:readOwn')],
      schema: {
        tags: ['Fees'],
        summary: 'Download the receipt PDF of a paid fee (staff, or the payer: athlete / guardian of the member)',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: binaryResponseSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const file = await getReceiptFile(tenantOf(request), request.params.id);
      return reply
        .type('application/pdf')
        .header('content-disposition', `attachment; filename="${file.filename}"`)
        .header('cache-control', 'private, no-store')
        .send(file.content);
    },
  );
};
