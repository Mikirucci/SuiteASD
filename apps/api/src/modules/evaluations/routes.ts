import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  evaluationSchema,
  historyItemSchema,
  listSummariesQuerySchema,
  matchMemberParamsSchema,
  memberSummarySchema,
  publishResultSchema,
  putEvaluationBodySchema,
  putStatsBodySchema,
  reportCardsSchema,
  seasonFilterQuerySchema,
  statsSchema,
} from './schema.js';
import {
  deleteEvaluation,
  deleteStats,
  getMemberHistory,
  getMemberSummary,
  getReportCards,
  listMemberSummaries,
  publishEvaluations,
  putEvaluation,
  putStats,
} from './service.js';

// SPEC 06 "Pagelle e statistiche". Writing needs evaluations:write (admin, coach). Reading is open to
// authenticated users and narrowed in the service (ABAC): evaluations:read sees everything, evaluations:readOwn
// (athlete, guardian) only the PUBLISHED cards of themselves / their linked children.
export const evaluationRoutes: FastifyPluginAsyncZod = async (app) => {
  const write = { onRequest: [app.requirePermission('evaluations:write')] };
  const readOwnOrAll = { onRequest: [app.requireAuth] };

  app.get(
    '/matches/:id/report-cards',
    {
      ...readOwnOrAll,
      schema: {
        tags: ['Evaluations'],
        summary: 'Report cards and match statistics of every player (staff: whole squad incl. drafts; players: own, published)',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: reportCardsSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getReportCards(tenantOf(request), request.params.id),
  );

  app.put(
    '/matches/:id/evaluations/:memberId',
    {
      ...write,
      schema: {
        tags: ['Evaluations'],
        summary: 'Create or update the report card (rating 1-10, notes) of a player; the MVP is recomputed',
        security: bearerSecurity,
        params: matchMemberParamsSchema,
        body: putEvaluationBodySchema,
        response: { 200: evaluationSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => {
      const { id, memberId } = request.params;
      return putEvaluation(tenantOf(request), id, memberId, request.body);
    },
  );

  app.delete(
    '/matches/:id/evaluations/:memberId',
    {
      ...write,
      schema: {
        tags: ['Evaluations'],
        summary: 'Delete a report card; the MVP is recomputed',
        security: bearerSecurity,
        params: matchMemberParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      await deleteEvaluation(tenantOf(request), id, memberId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/matches/:id/evaluations/publish',
    {
      ...write,
      schema: {
        tags: ['Evaluations'],
        summary: 'Publish all draft report cards of the match and notify players and guardians (idempotent)',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: publishResultSchema, ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request) => publishEvaluations(tenantOf(request), request.params.id),
  );

  app.put(
    '/matches/:id/stats/:memberId',
    {
      ...write,
      schema: {
        tags: ['Evaluations'],
        summary: 'Create or replace the match statistics of a player (attacks, aces, blocks, receptions, errors)',
        security: bearerSecurity,
        params: matchMemberParamsSchema,
        body: putStatsBodySchema,
        response: { 200: statsSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => {
      const { id, memberId } = request.params;
      return putStats(tenantOf(request), id, memberId, request.body);
    },
  );

  app.delete(
    '/matches/:id/stats/:memberId',
    {
      ...write,
      schema: {
        tags: ['Evaluations'],
        summary: 'Delete the match statistics of a player',
        security: bearerSecurity,
        params: matchMemberParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      await deleteStats(tenantOf(request), id, memberId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/members/:id/evaluations',
    {
      ...readOwnOrAll,
      schema: {
        tags: ['Evaluations'],
        summary: 'Report cards of a player over time, newest match first (cursor pagination)',
        security: bearerSecurity,
        params: idParamsSchema,
        querystring: paginationQuerySchema.extend(seasonFilterQuerySchema.shape),
        response: { 200: pageSchema(historyItemSchema), ...problemResponses(400, 401, 403, 404, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, seasonId } = request.query;
      return getMemberHistory(tenantOf(request), request.params.id, seasonId, { limit, cursor });
    },
  );

  app.get(
    '/members/:id/evaluation-summary',
    {
      ...readOwnOrAll,
      schema: {
        tags: ['Evaluations'],
        summary: 'Season aggregates of a player (average, best, MVP count, totals, trend); published cards only',
        security: bearerSecurity,
        params: idParamsSchema,
        querystring: seasonFilterQuerySchema,
        response: { 200: memberSummarySchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => getMemberSummary(tenantOf(request), request.params.id, request.query.seasonId),
  );

  app.get(
    '/evaluation-summaries',
    {
      onRequest: [app.requirePermission('evaluations:read')],
      schema: {
        tags: ['Evaluations'],
        summary: 'Compare the players of a team or season: one aggregate per player (cursor pagination)',
        security: bearerSecurity,
        querystring: paginationQuerySchema.extend(listSummariesQuerySchema.shape),
        response: { 200: pageSchema(memberSummarySchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listMemberSummaries(tenantOf(request), filters, { limit, cursor });
    },
  );
};
