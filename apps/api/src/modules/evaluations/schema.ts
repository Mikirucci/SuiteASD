import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { isValidRating } from './rules.js';

const idRef = z.string().min(1).max(64);

export const matchMemberParamsSchema = z.object({ id: idRef, memberId: idRef });

export const ratingSchema = z
  .number()
  .refine(isValidRating, { message: 'The rating must be between 1 and 10 with at most one decimal' });

export const putEvaluationBodySchema = z.object({
  rating: ratingSchema,
  notes: z.string().trim().max(1000).nullable().optional().describe('Coach notes, visible to the player once published'),
});

const count = z.number().int().min(0).max(500);

export const putStatsBodySchema = z.object({
  attackPoints: count.default(0).describe('Attacchi vincenti'),
  aces: count.default(0),
  blocks: count.default(0).describe('Muri'),
  receptions: count.default(0).describe('Ricezioni positive'),
  errors: count.default(0),
});

export const evaluationSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  memberId: z.string(),
  rating: z.number(),
  notes: z.string().nullable(),
  isMvp: z.boolean().describe('True for the best rating of the match (ties share it)'),
  published: z.boolean(),
  publishedAt: isoDateTimeSchema.nullable(),
  authorId: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const statsSchema = z.object({
  matchId: z.string(),
  memberId: z.string(),
  attackPoints: z.number().int(),
  aces: z.number().int(),
  blocks: z.number().int(),
  receptions: z.number().int(),
  errors: z.number().int(),
  updatedAt: isoDateTimeSchema,
});

const statLineSchema = statsSchema.pick({ attackPoints: true, aces: true, blocks: true, receptions: true, errors: true });

export const memberBriefSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fieldRole: z.string().nullable().describe('Role on the court, e.g. Schiacciatrice, Libero'),
});

export const reportCardSchema = z.object({
  member: memberBriefSchema,
  evaluation: evaluationSchema.nullable(),
  stats: statsSchema.nullable(),
});

export const reportCardsSchema = z.object({
  matchId: z.string(),
  label: z.string().describe('e.g. "Aquile Volley 3-1 Delfini Volley"'),
  data: z.array(reportCardSchema),
});

export const publishResultSchema = z.object({
  publishedCount: z.number().int(),
  evaluations: z.array(evaluationSchema),
});

export const seasonFilterQuerySchema = z.object({
  seasonId: idRef.optional().describe('Only matches of competitions in this season; omit for all seasons'),
});

export const listSummariesQuerySchema = seasonFilterQuerySchema.extend({
  teamId: idRef.optional().describe('Only members of this team'),
});

export const trendPointSchema = z.object({
  matchId: z.string(),
  playedAt: isoDateTimeSchema.nullable(),
  rating: z.number(),
});

export const summarySchema = z.object({
  matchesRated: z.number().int(),
  averageRating: z.number().nullable(),
  bestRating: z.number().nullable(),
  mvpCount: z.number().int(),
  totals: statLineSchema,
  trend: z.array(trendPointSchema).describe('Ratings in chronological order'),
});

export const memberSummarySchema = summarySchema.extend({ member: memberBriefSchema });

export const historyItemSchema = z.object({
  matchId: z.string(),
  round: z.number().int().nullable(),
  playedAt: isoDateTimeSchema.nullable(),
  label: z.string(),
  evaluation: evaluationSchema,
  stats: statsSchema.nullable(),
});

export type PutEvaluationBody = z.infer<typeof putEvaluationBodySchema>;
export type PutStatsBody = z.infer<typeof putStatsBodySchema>;
export type EvaluationDto = z.infer<typeof evaluationSchema>;
export type StatsDto = z.infer<typeof statsSchema>;
export type ReportCardsDto = z.infer<typeof reportCardsSchema>;
export type PublishResultDto = z.infer<typeof publishResultSchema>;
export type MemberSummaryDto = z.infer<typeof memberSummarySchema>;
export type SummaryDto = z.infer<typeof summarySchema>;
export type HistoryItemDto = z.infer<typeof historyItemSchema>;
export type ListSummariesQuery = z.infer<typeof listSummariesQuerySchema>;
