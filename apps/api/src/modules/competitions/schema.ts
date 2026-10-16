import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { competitionKindSchema, matchStatusSchema, sportSchema, tiebreakerSchema } from '../../shared/enums.js';

const idRef = z.string().min(1).max(64);

// ---- params ------------------------------------------------------------------------------------

export const groupParamsSchema = z.object({ id: idRef, gid: idRef });
export const groupTeamParamsSchema = z.object({ id: idRef, gid: idRef, tid: idRef });

// ---- seasons -----------------------------------------------------------------------------------

export const createSeasonBodySchema = z
  .object({
    name: z.string().trim().min(1).max(40).describe('e.g. 2026/27'),
    startsOn: isoDateTimeSchema,
    endsOn: isoDateTimeSchema,
    isCurrent: z.boolean().default(false).describe('Making a season current clears the flag on the others'),
  })
  .refine((body) => new Date(body.endsOn) > new Date(body.startsOn), {
    message: 'endsOn must be after startsOn',
    path: ['endsOn'],
  });

export const updateSeasonBodySchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    startsOn: isoDateTimeSchema,
    endsOn: isoDateTimeSchema,
    isCurrent: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const seasonSchema = z.object({
  id: z.string(),
  name: z.string(),
  startsOn: isoDateTimeSchema,
  endsOn: isoDateTimeSchema,
  isCurrent: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---- competitions ------------------------------------------------------------------------------

const rulePair = z.tuple([z.number().int().min(0).max(9), z.number().int().min(0).max(9)]);

// Every possible final score must have points, so a standings computation can never meet an unknown score.
export const pointsRulesSchema = z
  .object({ '3-0': rulePair, '3-1': rulePair, '3-2': rulePair })
  .describe('Points [winner, loser] by final set score, e.g. {"3-0":[3,0],"3-1":[3,0],"3-2":[2,1]}');

export const tiebreakersSchema = z
  .array(tiebreakerSchema)
  .max(3)
  .refine((rules) => new Set(rules).size === rules.length, { message: 'Tiebreakers must not repeat' })
  .describe('Applied in order after points; ties left are ordered by team name');

export const createCompetitionBodySchema = z.object({
  seasonId: idRef,
  name: z.string().trim().min(1).max(120),
  kind: competitionKindSchema.default('LEAGUE'),
  sport: sportSchema.default('VOLLEY'),
  pointsRules: pointsRulesSchema.optional(),
  tiebreakers: tiebreakersSchema.optional(),
});

export const updateCompetitionBodySchema = z
  .object({
    name: createCompetitionBodySchema.shape.name,
    kind: competitionKindSchema,
    pointsRules: pointsRulesSchema.nullable().describe('null restores the default volleyball rules'),
    tiebreakers: tiebreakersSchema.nullable().describe('null restores the default order'),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const listCompetitionsQuerySchema = z.object({
  seasonId: idRef.optional(),
  kind: competitionKindSchema.optional(),
  q: z.string().trim().min(1).max(80).optional().describe('Substring of the name'),
});

export const competitionSchema = z.object({
  id: z.string(),
  seasonId: z.string(),
  name: z.string(),
  kind: competitionKindSchema,
  sport: sportSchema,
  pointsRules: pointsRulesSchema,
  tiebreakers: z.array(tiebreakerSchema),
  groupsCount: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---- groups and their teams --------------------------------------------------------------------

export const createGroupBodySchema = z.object({ name: z.string().trim().min(1).max(80) });
export const updateGroupBodySchema = createGroupBodySchema;

export const groupSchema = z.object({
  id: z.string(),
  competitionId: z.string(),
  name: z.string(),
  teamsCount: z.number().int(),
  matchesCount: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const createGroupTeamBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional().describe('Defaults to the society team name when teamId is given'),
    teamId: idRef.optional().describe('One of our own teams; omit for an opponent'),
  })
  .refine((body) => body.name !== undefined || body.teamId !== undefined, {
    message: 'Either name or teamId is required',
    path: ['name'],
  });

export const updateGroupTeamBodySchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const groupTeamSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  name: z.string(),
  teamId: z.string().nullable(),
  isOurTeam: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---- matches -----------------------------------------------------------------------------------

export const setScoresSchema = z
  .array(z.tuple([z.number().int().min(0).max(99), z.number().int().min(0).max(99)]))
  .max(5)
  .describe('One [home, away] pair per set, in the order played');

export const createMatchBodySchema = z
  .object({
    round: z.number().int().min(1).max(200).optional().describe('Giornata'),
    homeTeamId: idRef.describe('Id of a participant of the group (GroupTeam)'),
    awayTeamId: idRef,
    playedAt: isoDateTimeSchema.optional().describe('Kick-off; planned date for a match not yet played'),
    eventId: idRef.optional().describe('Calendar event of the match'),
  })
  .refine((body) => body.homeTeamId !== body.awayTeamId, {
    message: 'A team cannot play against itself',
    path: ['awayTeamId'],
  });

export const updateMatchBodySchema = z
  .object({
    round: z.number().int().min(1).max(200).nullable(),
    homeTeamId: idRef,
    awayTeamId: idRef,
    playedAt: isoDateTimeSchema.nullable(),
    eventId: idRef.nullable(),
    status: z.enum(['SCHEDULED', 'POSTPONED', 'CANCELLED']).describe('PLAYED is set by entering a result'),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const matchResultBodySchema = z.object({
  homeSets: z.number().int().min(0).max(3),
  awaySets: z.number().int().min(0).max(3),
  setScores: setScoresSchema.optional(),
  playedAt: isoDateTimeSchema.optional(),
});

export const listMatchesQuerySchema = z.object({
  round: z.coerce.number().int().min(1).optional(),
  status: matchStatusSchema.optional(),
  groupTeamId: idRef.optional().describe('Matches of this participant, home or away'),
});

const matchSideSchema = z.object({ id: z.string(), name: z.string(), isOurTeam: z.boolean() });

export const matchSchema = z.object({
  id: z.string(),
  competitionId: z.string(),
  groupId: z.string(),
  round: z.number().int().nullable(),
  homeTeam: matchSideSchema,
  awayTeam: matchSideSchema,
  status: matchStatusSchema,
  homeSets: z.number().int().nullable(),
  awaySets: z.number().int().nullable(),
  setScores: setScoresSchema.nullable(),
  playedAt: isoDateTimeSchema.nullable(),
  eventId: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---- standings and rounds ----------------------------------------------------------------------

export const standingRowSchema = z.object({
  position: z.number().int(),
  groupTeamId: z.string(),
  name: z.string(),
  teamId: z.string().nullable(),
  isOurTeam: z.boolean().describe('True for the society\'s own team: highlight it in the UI'),
  points: z.number().int(),
  played: z.number().int(),
  won: z.number().int(),
  lost: z.number().int(),
  setsFor: z.number().int(),
  setsAgainst: z.number().int(),
  setRatio: z.number().nullable().describe('null when no set was conceded'),
  pointsFor: z.number().int(),
  pointsAgainst: z.number().int(),
  pointRatio: z.number().nullable().describe('null when set scores were not recorded or no point was conceded'),
});

export const standingsSchema = z.object({
  competitionId: z.string(),
  groupId: z.string(),
  groupName: z.string(),
  pointsRules: pointsRulesSchema,
  tiebreakers: z.array(tiebreakerSchema),
  matchesPlayed: z.number().int(),
  matchesTotal: z.number().int(),
  rows: z.array(standingRowSchema),
});

export const roundSummarySchema = z.object({
  round: z.number().int().nullable().describe('null groups the matches without a round'),
  matchesCount: z.number().int(),
  playedCount: z.number().int(),
});

export type CreateSeasonBody = z.infer<typeof createSeasonBodySchema>;
export type UpdateSeasonBody = z.infer<typeof updateSeasonBodySchema>;
export type SeasonDto = z.infer<typeof seasonSchema>;
export type CreateCompetitionBody = z.infer<typeof createCompetitionBodySchema>;
export type UpdateCompetitionBody = z.infer<typeof updateCompetitionBodySchema>;
export type ListCompetitionsQuery = z.infer<typeof listCompetitionsQuerySchema>;
export type CompetitionDto = z.infer<typeof competitionSchema>;
export type GroupDto = z.infer<typeof groupSchema>;
export type CreateGroupTeamBody = z.infer<typeof createGroupTeamBodySchema>;
export type UpdateGroupTeamBody = z.infer<typeof updateGroupTeamBodySchema>;
export type GroupTeamDto = z.infer<typeof groupTeamSchema>;
export type CreateMatchBody = z.infer<typeof createMatchBodySchema>;
export type UpdateMatchBody = z.infer<typeof updateMatchBodySchema>;
export const importMatchesBodySchema = z.object({
  csv: z.string().min(1).max(200_000).describe('CSV text with a header row (";" or "," separated): giornata, data, ora, casa, ospite, risultato'),
  dryRun: z.boolean().default(true).describe('Check and report only (default). Send false to apply'),
});

export const importMatchesResultSchema = z.object({
  dryRun: z.boolean(),
  totalRows: z.number().int(),
  validRows: z.number().int(),
  invalidRows: z.number().int(),
  teamsCreated: z.number().int().describe('Participants added to the group'),
  matchesCreated: z.number().int(),
  matchesUpdated: z.number().int().describe('Matches already in the group, found again by teams and round or day'),
  resultsSet: z.number().int(),
  eventsCreated: z.number().int().describe('Calendar events created for the matches of our own teams'),
  ignoredColumns: z.array(z.string()),
  errors: z.array(z.object({ row: z.number().int(), field: z.string().nullable(), message: z.string() })),
});

export type ImportMatchesBody = z.infer<typeof importMatchesBodySchema>;
export type ImportMatchesResult = z.infer<typeof importMatchesResultSchema>;
export type MatchResultBody = z.infer<typeof matchResultBodySchema>;
export type ListMatchesQuery = z.infer<typeof listMatchesQuerySchema>;
export type MatchDto = z.infer<typeof matchSchema>;
export type StandingsDto = z.infer<typeof standingsSchema>;
export type RoundSummaryDto = z.infer<typeof roundSummarySchema>;
