import { z } from 'zod';
import { patchBodySchema } from '../../lib/crud-routes.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { dateOnlySchema } from '../../lib/date-only.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';

const costCentsSchema = z.number().int().min(1).max(100_000_000).describe('Cost in euro cents: it weighs on the balance as an expense');

export const createVenueBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  capacity: z.number().int().min(1).max(100_000).optional(),
  availability: z.string().trim().min(1).max(500).optional().describe('Free text, e.g. "Mar e Gio 18:00-21:00"'),
  notes: z.string().trim().min(1).max(1000).optional(),
  costCents: costCentsSchema.optional(),
  costDate: dateOnlySchema.optional().describe('Day the cost is booked in the balance (default: today)'),
});

export const updateVenueBodySchema = patchBodySchema({
  name: createVenueBodySchema.shape.name,
  address: createVenueBodySchema.shape.address.nullable(),
  city: createVenueBodySchema.shape.city.nullable(),
  capacity: createVenueBodySchema.shape.capacity.nullable(),
  availability: createVenueBodySchema.shape.availability.nullable(),
  notes: createVenueBodySchema.shape.notes.nullable(),
  costCents: costCentsSchema.nullable().describe('null removes the cost and its expense from the balance'),
  costDate: dateOnlySchema.nullable(),
});

export const listVenuesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(80).optional().describe('Substring of the venue name or city'),
});

export const venueSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  capacity: z.number().int().nullable(),
  availability: z.string().nullable(),
  notes: z.string().nullable(),
  costCents: z.number().int().nullable(),
  costDate: dateOnlySchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CreateVenueBody = z.infer<typeof createVenueBodySchema>;
export type UpdateVenueBody = z.infer<typeof updateVenueBodySchema>;
export type ListVenuesQuery = z.infer<typeof listVenuesQuerySchema>;
export type VenueDto = z.infer<typeof venueSchema>;
