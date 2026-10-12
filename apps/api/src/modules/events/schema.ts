import { z } from 'zod';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { eventStatusSchema, eventTypeSchema } from '../../shared/enums.js';
import { convocationSummarySchema } from '../convocations/summary.js';
import { MAX_OCCURRENCES } from './recurrence.js';

const idRef = z.string().min(1).max(64);
// Clients send local times with their UTC offset ("2026-11-14T20:30:00+01:00") or in UTC.
const instantSchema = z.iso.datetime({ offset: true });

const endsAfterStart = {
  message: 'endsAt must be after startsAt',
  path: ['endsAt'],
};

export const recurrenceBodySchema = z
  .object({
    frequency: z.literal('WEEKLY'),
    interval: z.number().int().min(1).max(4).default(1).describe('Every N weeks'),
    until: z.iso.date().optional().describe('Last day of the series (inclusive)'),
    count: z.number().int().min(2).max(MAX_OCCURRENCES).optional().describe('Total number of occurrences'),
  })
  .refine((value) => (value.until === undefined) !== (value.count === undefined), {
    message: 'Provide exactly one of `until` or `count`',
  });

const eventFields = {
  title: z.string().trim().min(1).max(160).describe('e.g. "Aquile Volley vs Delfini Volley"'),
  startsAt: instantSchema,
  endsAt: instantSchema,
  teamId: idRef,
  venueId: idRef,
  notes: z.string().trim().min(1).max(1000),
  maxConvocations: z.number().int().min(1).max(40).describe('Convocation slots (default 12)'),
};

export const createEventBodySchema = z
  .object({
    type: eventTypeSchema,
    title: eventFields.title,
    startsAt: eventFields.startsAt,
    endsAt: eventFields.endsAt.optional(),
    teamId: eventFields.teamId.optional(),
    venueId: eventFields.venueId.optional(),
    notes: eventFields.notes.optional(),
    maxConvocations: eventFields.maxConvocations.optional(),
    recurrence: recurrenceBodySchema.optional().describe('Weekly series, TRAINING only'),
  })
  .refine((body) => !body.endsAt || new Date(body.endsAt) > new Date(body.startsAt), endsAfterStart);

// PATCH: `null` clears an optional field. Changing startsAt or venueId reschedules the event and notifies.
export const updateEventBodySchema = z
  .object({
    title: eventFields.title,
    startsAt: eventFields.startsAt,
    endsAt: eventFields.endsAt.nullable(),
    teamId: eventFields.teamId.nullable(),
    venueId: eventFields.venueId.nullable(),
    notes: eventFields.notes.nullable(),
    maxConvocations: eventFields.maxConvocations.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const cancelEventBodySchema = z.object({
  reason: z.string().trim().min(1).max(300).optional().describe('Shown in the notification'),
});

const rangeFields = {
  from: instantSchema.optional().describe('Events starting at or after this instant'),
  to: instantSchema.optional().describe('Events starting before this instant'),
  teamId: idRef.optional(),
  type: eventTypeSchema.optional(),
  status: eventStatusSchema.optional(),
};

export const listEventsQuerySchema = paginationQuerySchema.extend(rangeFields);
export const exportEventsQuerySchema = z.object(rangeFields);

export const eventSchema = z.object({
  id: z.string(),
  type: eventTypeSchema,
  title: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  status: eventStatusSchema,
  notes: z.string().nullable(),
  team: z.object({ id: z.string(), name: z.string() }).nullable(),
  venue: z.object({ id: z.string(), name: z.string(), address: z.string().nullable() }).nullable(),
  recurrenceRule: z.string().nullable().describe('RRULE on the first occurrence of a series'),
  recurrenceParentId: z.string().nullable().describe('First occurrence of the series, for the others'),
  convocations: convocationSummarySchema,
  convocationsSentAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const createdEventSchema = eventSchema.extend({
  occurrencesCreated: z.number().int().describe('1 for a single event, the series length for a recurrence'),
});

export type CreateEventBody = z.infer<typeof createEventBodySchema>;
export type UpdateEventBody = z.infer<typeof updateEventBodySchema>;
export type CancelEventBody = z.infer<typeof cancelEventBodySchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type ExportEventsQuery = z.infer<typeof exportEventsQuerySchema>;
export type EventDto = z.infer<typeof eventSchema>;
export type CreatedEventDto = z.infer<typeof createdEventSchema>;
