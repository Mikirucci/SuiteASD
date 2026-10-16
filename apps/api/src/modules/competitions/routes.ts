import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  competitionSchema,
  createCompetitionBodySchema,
  createGroupBodySchema,
  createGroupTeamBodySchema,
  createMatchBodySchema,
  createSeasonBodySchema,
  groupParamsSchema,
  groupSchema,
  groupTeamParamsSchema,
  groupTeamSchema,
  importMatchesBodySchema,
  importMatchesResultSchema,
  listCompetitionsQuerySchema,
  listMatchesQuerySchema,
  matchResultBodySchema,
  matchSchema,
  roundSummarySchema,
  seasonSchema,
  standingsSchema,
  updateCompetitionBodySchema,
  updateGroupBodySchema,
  updateGroupTeamBodySchema,
  updateMatchBodySchema,
  updateSeasonBodySchema,
} from './schema.js';
import { importMatches } from './match-import.js';
import {
  clearMatchResult,
  createCompetition,
  createGroup,
  createGroupTeam,
  createMatch,
  createSeason,
  deleteCompetition,
  deleteGroup,
  deleteGroupTeam,
  deleteMatch,
  deleteSeason,
  getCompetition,
  getGroup,
  getMatch,
  getSeason,
  getStandings,
  listCompetitions,
  listGroupTeams,
  listGroups,
  listMatches,
  listRounds,
  listSeasons,
  renameGroup,
  renameGroupTeam,
  setMatchResult,
  updateCompetition,
  updateMatch,
  updateSeason,
} from './service.js';

// SPEC 05 "Gironi e classifiche": seasons -> competitions -> groups -> matches. Standings are derived (standings.ts).
// Read: competitions:read (everyone). Write: competitions:write (admin, segreteria, allenatore).
export const competitionRoutes: FastifyPluginAsyncZod = async (app) => {
  const read = { onRequest: [app.requirePermission('competitions:read')] };
  const write = { onRequest: [app.requirePermission('competitions:write')] };

  // ---- seasons ----
  app.get(
    '/seasons',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'List seasons (cursor pagination, newest first)',
        security: bearerSecurity,
        querystring: paginationQuerySchema,
        response: { 200: pageSchema(seasonSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => listSeasons(tenantOf(request), request.query),
  );

  app.get(
    '/seasons/:id',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'Get a season',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: seasonSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getSeason(tenantOf(request), request.params.id),
  );

  app.post(
    '/seasons',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Create a season',
        security: bearerSecurity,
        body: createSeasonBodySchema,
        response: { 201: seasonSchema, ...problemResponses(401, 403, 409, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createSeason(tenantOf(request), request.body)),
  );

  app.patch(
    '/seasons/:id',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Update a season (partial)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateSeasonBodySchema,
        response: { 200: seasonSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => updateSeason(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/seasons/:id',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Delete a season without competitions or fee plans',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      await deleteSeason(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );

  // ---- competitions ----
  app.get(
    '/competitions',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'List competitions (cursor pagination)',
        security: bearerSecurity,
        querystring: paginationQuerySchema.extend(listCompetitionsQuerySchema.shape),
        response: { 200: pageSchema(competitionSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listCompetitions(tenantOf(request), filters, { limit, cursor });
    },
  );

  app.get(
    '/competitions/:id',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'Get a competition with its effective points rules and tiebreakers',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: competitionSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getCompetition(tenantOf(request), request.params.id),
  );

  app.post(
    '/competitions',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Create a competition (championship or tournament) in a season',
        security: bearerSecurity,
        body: createCompetitionBodySchema,
        response: { 201: competitionSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createCompetition(tenantOf(request), request.body)),
  );

  app.patch(
    '/competitions/:id',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Update a competition (partial); standings follow the new rules immediately',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateCompetitionBodySchema,
        response: { 200: competitionSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => updateCompetition(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/competitions/:id',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Delete a competition without matches',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      await deleteCompetition(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );

  // ---- groups ----
  app.get(
    '/competitions/:id/groups',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'List the groups of a competition',
        security: bearerSecurity,
        params: idParamsSchema,
        querystring: paginationQuerySchema,
        response: { 200: pageSchema(groupSchema), ...problemResponses(400, 401, 403, 404, 422) },
      },
    },
    async (request) => listGroups(tenantOf(request), request.params.id, request.query),
  );

  app.post(
    '/competitions/:id/groups',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Create a group',
        security: bearerSecurity,
        params: idParamsSchema,
        body: createGroupBodySchema,
        response: { 201: groupSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await createGroup(tenantOf(request), request.params.id, request.body.name)),
  );

  app.get(
    '/competitions/:id/groups/:gid',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'Get a group',
        security: bearerSecurity,
        params: groupParamsSchema,
        response: { 200: groupSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getGroup(tenantOf(request), request.params.id, request.params.gid),
  );

  app.patch(
    '/competitions/:id/groups/:gid',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Rename a group',
        security: bearerSecurity,
        params: groupParamsSchema,
        body: updateGroupBodySchema,
        response: { 200: groupSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => renameGroup(tenantOf(request), request.params.id, request.params.gid, request.body.name),
  );

  app.delete(
    '/competitions/:id/groups/:gid',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Delete a group without matches',
        security: bearerSecurity,
        params: groupParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      await deleteGroup(tenantOf(request), request.params.id, request.params.gid);
      return reply.status(204).send(null);
    },
  );

  // ---- group participants ----
  app.get(
    '/competitions/:id/groups/:gid/teams',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'List the teams of a group (ours and opponents)',
        security: bearerSecurity,
        params: groupParamsSchema,
        querystring: paginationQuerySchema,
        response: { 200: pageSchema(groupTeamSchema), ...problemResponses(400, 401, 403, 404, 422) },
      },
    },
    async (request) => listGroupTeams(tenantOf(request), request.params.id, request.params.gid, request.query),
  );

  app.post(
    '/competitions/:id/groups/:gid/teams',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Add a team to a group: one of ours (teamId) or an opponent (name)',
        security: bearerSecurity,
        params: groupParamsSchema,
        body: createGroupTeamBodySchema,
        response: { 201: groupTeamSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await createGroupTeam(tenantOf(request), request.params.id, request.params.gid, request.body)),
  );

  app.patch(
    '/competitions/:id/groups/:gid/teams/:tid',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Rename a team of a group',
        security: bearerSecurity,
        params: groupTeamParamsSchema,
        body: updateGroupTeamBodySchema,
        response: { 200: groupTeamSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => {
      const { id, gid, tid } = request.params;
      return renameGroupTeam(tenantOf(request), id, gid, tid, request.body);
    },
  );

  app.delete(
    '/competitions/:id/groups/:gid/teams/:tid',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Remove a team without matches from a group',
        security: bearerSecurity,
        params: groupTeamParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      const { id, gid, tid } = request.params;
      await deleteGroupTeam(tenantOf(request), id, gid, tid);
      return reply.status(204).send(null);
    },
  );

  // ---- matches ----
  app.get(
    '/competitions/:id/groups/:gid/matches',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'List the matches of a group by round (cursor pagination)',
        security: bearerSecurity,
        params: groupParamsSchema,
        querystring: paginationQuerySchema.extend(listMatchesQuerySchema.shape),
        response: { 200: pageSchema(matchSchema), ...problemResponses(400, 401, 403, 404, 422) },
      },
    },
    async (request) => {
      const { limit, cursor, ...filters } = request.query;
      return listMatches(tenantOf(request), request.params.id, request.params.gid, filters, { limit, cursor });
    },
  );

  app.post(
    '/competitions/:id/groups/:gid/matches/import',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Import the calendar and the results of a group from CSV text (dry run by default)',
        description:
          'One row per match. Columns (Italian or English, any order): giornata, data (gg/mm/aaaa), ora, casa, ospite, and either risultato (3-1) or set casa / set ospite. ' +
          'Teams are added to the group as they appear (a name equal to one of our teams becomes our team); matches already in the group are updated, not duplicated; ' +
          'our matches without a result get a calendar event so they can be convocated.',
        security: bearerSecurity,
        params: groupParamsSchema,
        body: importMatchesBodySchema,
        response: { 200: importMatchesResultSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => importMatches(tenantOf(request), request.params.id, request.params.gid, request.body),
  );

  app.post(
    '/competitions/:id/groups/:gid/matches',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Schedule a match between two teams of the group',
        security: bearerSecurity,
        params: groupParamsSchema,
        body: createMatchBodySchema,
        response: { 201: matchSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await createMatch(tenantOf(request), request.params.id, request.params.gid, request.body)),
  );

  app.get(
    '/competitions/:id/groups/:gid/rounds',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'Rounds (giornate) of a group with match counts',
        security: bearerSecurity,
        params: groupParamsSchema,
        response: { 200: z.object({ data: z.array(roundSummarySchema) }), ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => ({ data: await listRounds(tenantOf(request), request.params.id, request.params.gid) }),
  );

  app.get(
    '/matches/:id',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'Get a match',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: matchSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getMatch(tenantOf(request), request.params.id),
  );

  app.patch(
    '/matches/:id',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Reschedule, postpone or cancel a match (partial)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateMatchBodySchema,
        response: { 200: matchSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => updateMatch(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/matches/:id',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Delete a match without report cards',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      await deleteMatch(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.put(
    '/matches/:id/result',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Enter or correct the result (3 winning sets, optional set scores); the standings update by themselves',
        security: bearerSecurity,
        params: idParamsSchema,
        body: matchResultBodySchema,
        response: { 200: matchSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => setMatchResult(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/matches/:id/result',
    {
      ...write,
      schema: {
        tags: ['Competitions'],
        summary: 'Remove the result: the match goes back to SCHEDULED',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: matchSchema, ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request) => clearMatchResult(tenantOf(request), request.params.id),
  );

  // ---- standings ----
  app.get(
    '/competitions/:id/groups/:gid/standings',
    {
      ...read,
      schema: {
        tags: ['Competitions'],
        summary: 'Standings of a group, derived from the played matches (not paginated: one row per team)',
        security: bearerSecurity,
        params: groupParamsSchema,
        response: { 200: standingsSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getStandings(tenantOf(request), request.params.id, request.params.gid),
  );
};
