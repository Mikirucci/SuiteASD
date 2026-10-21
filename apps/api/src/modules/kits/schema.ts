import { z } from 'zod';
import { patchBodySchema } from '../../lib/crud-routes.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { dateOnlySchema } from '../../lib/date-only.js';
import { isoDateTimeSchema } from '../../lib/schemas.js';

const idRef = z.string().min(1).max(64);
const costCentsSchema = z.number().int().min(1).max(100_000_000).describe('Cost in euro cents: it weighs on the balance as an expense');

export const createKitBodySchema = z.object({
  item: z.string().trim().min(1).max(80).describe('What it is, e.g. "Maglia gara"'),
  size: z.string().trim().min(1).max(20).optional(),
  number: z.number().int().min(0).max(99).optional().describe('Jersey number'),
  condition: z.string().trim().min(1).max(80).optional(),
  memberId: idRef.optional().describe('Assigns the item to this member (assignedAt is set by the server)'),
  notes: z.string().trim().min(1).max(500).optional(),
  costCents: costCentsSchema.optional(),
  costDate: dateOnlySchema.optional().describe('Day the cost is booked in the balance (default: today)'),
});

export const updateKitBodySchema = patchBodySchema({
  item: createKitBodySchema.shape.item,
  size: createKitBodySchema.shape.size.nullable(),
  number: createKitBodySchema.shape.number.nullable(),
  condition: createKitBodySchema.shape.condition.nullable(),
  memberId: idRef.nullable().describe('A member id assigns the item, null returns it to the stock'),
  notes: createKitBodySchema.shape.notes.nullable(),
  costCents: costCentsSchema.nullable().describe('null removes the cost and its expense from the balance'),
  costDate: dateOnlySchema.nullable(),
});

export const listKitsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(80).optional().describe('Substring of the item name, the size or the name of who holds it'),
  item: z.string().trim().min(1).max(80).optional().describe('Exact item name: the items of one group'),
  size: z.string().trim().min(1).max(20).optional(),
  memberId: idRef.optional(),
  assigned: z.stringbool().optional().describe('true: only assigned items, false: only the ones in stock'),
});

export const kitSchema = z.object({
  id: z.string(),
  item: z.string(),
  size: z.string().nullable(),
  number: z.number().int().nullable(),
  condition: z.string().nullable(),
  memberId: z.string().nullable(),
  member: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  assignedAt: isoDateTimeSchema.nullable(),
  notes: z.string().nullable(),
  costCents: z.number().int().nullable(),
  costDate: dateOnlySchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CreateKitBody = z.infer<typeof createKitBodySchema>;
export type UpdateKitBody = z.infer<typeof updateKitBodySchema>;
export type ListKitsQuery = z.infer<typeof listKitsQuerySchema>;
export type KitDto = z.infer<typeof kitSchema>;

export const kitGroupSchema = z.object({
  item: z.string(),
  total: z.number().int().describe('Pieces of this item'),
  assigned: z.number().int().describe('Pieces held by a member'),
  inStock: z.number().int().describe('Pieces in the stock'),
  totalCostCents: z.number().int().describe('Sum of the costs recorded for the pieces'),
});

export const kitGroupsSchema = z.object({ data: z.array(kitGroupSchema).describe('One group per item name, ordered by name') });

export type KitGroupsDto = z.infer<typeof kitGroupsSchema>;
