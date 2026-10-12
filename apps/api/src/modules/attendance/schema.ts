import { z } from 'zod';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';

const idRef = z.string().min(1).max(64);
const instantSchema = z.iso.datetime({ offset: true });

export const MAX_ENTRIES_PER_CHECK_IN = 100;

export const checkInBodySchema = z.object({
  entries: z
    .array(
      z.object({
        memberId: idRef,
        present: z.boolean(),
        note: z.string().trim().min(1).max(300).nullable().optional().describe('`null` clears the note'),
      }),
    )
    .min(1)
    .max(MAX_ENTRIES_PER_CHECK_IN)
    .refine((entries) => new Set(entries.map((entry) => entry.memberId)).size === entries.length, {
      message: 'Duplicate member ids',
    }),
});

export const rangeQuerySchema = z.object({
  from: instantSchema.optional().describe('Trainings starting at or after this instant'),
  to: instantSchema.optional().describe('Trainings starting before this instant'),
});

export const memberHistoryQuerySchema = paginationQuerySchema.extend(rangeQuerySchema.shape);

const memberRefSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fieldRole: z.string().nullable(),
});

export const attendanceTotalsSchema = z.object({
  present: z.number().int(),
  total: z.number().int().describe('Recorded attendances'),
  percentage: z.number().nullable().describe('present / total in %, one decimal; null when nothing is recorded'),
});

export const attendanceSheetSchema = z.object({
  eventId: z.string(),
  summary: z.object({
    present: z.number().int(),
    absent: z.number().int(),
    notRecorded: z.number().int().describe('Team athletes without a check-in yet'),
  }),
  data: z.array(
    z.object({
      member: memberRefSchema,
      present: z.boolean().nullable().describe('null = not recorded yet'),
      note: z.string().nullable(),
    }),
  ),
});

export const memberHistorySchema = z.object({
  member: memberRefSchema,
  summary: attendanceTotalsSchema,
  data: z.array(
    z.object({
      eventId: z.string(),
      title: z.string(),
      startsAt: isoDateTimeSchema,
      present: z.boolean(),
      note: z.string().nullable(),
    }),
  ),
  page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
});

export const teamSummarySchema = z.object({
  team: z.object({ id: z.string(), name: z.string() }),
  trainings: z.number().int().describe('Trainings of the period with a recorded check-in'),
  summary: attendanceTotalsSchema,
  members: z.array(z.object({ member: memberRefSchema }).extend(attendanceTotalsSchema.shape)),
});

export type CheckInBody = z.infer<typeof checkInBodySchema>;
export type RangeQuery = z.infer<typeof rangeQuerySchema>;
export type MemberHistoryQuery = z.infer<typeof memberHistoryQuerySchema>;
export type AttendanceSheetDto = z.infer<typeof attendanceSheetSchema>;
export type MemberHistoryDto = z.infer<typeof memberHistorySchema>;
export type TeamSummaryDto = z.infer<typeof teamSummarySchema>;
export type AttendanceTotals = z.infer<typeof attendanceTotalsSchema>;
