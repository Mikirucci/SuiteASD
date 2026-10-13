import { z } from 'zod';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { eventTypeSchema } from '../../shared/enums.js';

export const statisticsOverviewSchema = z.object({
  members: z.object({
    total: z.number().int().describe('Active tesserati'),
    byTeam: z.array(z.object({ teamId: z.string(), teamName: z.string(), count: z.number().int() })),
  }),
  certificates: z
    .object({ OK: z.number().int(), EXPIRING: z.number().int(), EXPIRED: z.number().int(), MISSING: z.number().int() })
    .describe('Active tesserati by the status of their medical certificate'),
  fees: z.object({
    collectedCents: z.number().int(),
    toCollectCents: z.number().int(),
    overdueCents: z.number().int(),
    remindersSent: z.number().int(),
  }),
  attendance: z.object({
    averagePercent: z.number().int().nullable().describe('Average presence at trainings over the last 90 days; null without data'),
    recordsCount: z.number().int(),
  }),
  upcomingEvents: z.array(
    z.object({
      id: z.string(),
      type: eventTypeSchema,
      title: z.string(),
      startsAt: isoDateTimeSchema,
      teamName: z.string().nullable(),
    }),
  ),
  latestResults: z.array(
    z.object({
      matchId: z.string(),
      competitionName: z.string(),
      homeTeam: z.string(),
      awayTeam: z.string(),
      homeSets: z.number().int(),
      awaySets: z.number().int(),
      playedAt: isoDateTimeSchema.nullable(),
    }),
  ),
});

export type StatisticsOverviewDto = z.infer<typeof statisticsOverviewSchema>;
