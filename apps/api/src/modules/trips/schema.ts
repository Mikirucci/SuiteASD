import { z } from 'zod';
import { patchBodySchema } from '../../lib/crud-routes.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';
import { tripStatusSchema, tripTransportSchema } from '../../shared/enums.js';

const idRef = z.string().min(1).max(64);
const costCentsSchema = z.number().int().min(0).max(100_000_000).describe('Total cost in euro cents');

const returnNotBeforeDeparture = {
  message: 'returnAt must not be before departAt',
  path: ['returnAt'],
};
const isReturnValid = (body: { departAt?: string | undefined; returnAt?: string | null | undefined }): boolean =>
  !body.departAt || !body.returnAt || new Date(body.returnAt) >= new Date(body.departAt);

export const createTripBodySchema = z
  .object({
    eventId: idRef.optional().describe('Calendar event (e.g. the away match) this trip is for'),
    destination: z.string().trim().min(1).max(200),
    departAt: isoDateTimeSchema,
    returnAt: isoDateTimeSchema.optional(),
    transport: tripTransportSchema.default('CAR'),
    seats: z.number().int().min(1).max(100).optional().describe('Seats available on the vehicle(s)'),
    costCents: costCentsSchema.optional(),
    status: tripStatusSchema.default('PLANNED'),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .refine(isReturnValid, returnNotBeforeDeparture);

export const updateTripBodySchema = patchBodySchema({
  eventId: idRef.nullable(),
  destination: z.string().trim().min(1).max(200),
  departAt: isoDateTimeSchema,
  returnAt: isoDateTimeSchema.nullable(),
  transport: tripTransportSchema,
  seats: z.number().int().min(1).max(100).nullable(),
  costCents: costCentsSchema.nullable(),
  status: tripStatusSchema,
  notes: z.string().trim().min(1).max(1000).nullable(),
}).refine(isReturnValid, returnNotBeforeDeparture);

export const listTripsQuerySchema = paginationQuerySchema.extend({
  status: tripStatusSchema.optional(),
  from: isoDateTimeSchema.optional().describe('Departures at or after this instant'),
  to: isoDateTimeSchema.optional().describe('Departures at or before this instant'),
  eventId: idRef.optional(),
});

export const tripSchema = z.object({
  id: z.string(),
  eventId: z.string().nullable(),
  destination: z.string(),
  departAt: isoDateTimeSchema,
  returnAt: isoDateTimeSchema.nullable(),
  transport: tripTransportSchema,
  seats: z.number().int().nullable(),
  costCents: z.number().int().nullable(),
  status: tripStatusSchema,
  notes: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CreateTripBody = z.infer<typeof createTripBodySchema>;
export type UpdateTripBody = z.infer<typeof updateTripBodySchema>;
export type ListTripsQuery = z.infer<typeof listTripsQuerySchema>;
export type TripDto = z.infer<typeof tripSchema>;
