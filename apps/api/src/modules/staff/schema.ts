import { z } from 'zod';
import { patchBodySchema } from '../../lib/crud-routes.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { emailSchema, isoDateTimeSchema } from '../../lib/schemas.js';
import { staffRoleSchema } from '../../shared/enums.js';

const idRef = z.string().min(1).max(64);

export const createStaffBodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema.optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  role: staffRoleSchema.default('COACH'),
  qualifications: z.string().trim().min(1).max(500).optional().describe('e.g. "Allenatore 2° grado FIPAV"'),
  notes: z.string().trim().min(1).max(1000).optional(),
  userId: idRef.optional().describe('Login account of this staff member (must belong to the society)'),
});

export const updateStaffBodySchema = patchBodySchema({
  firstName: createStaffBodySchema.shape.firstName,
  lastName: createStaffBodySchema.shape.lastName,
  email: emailSchema.nullable(),
  phone: createStaffBodySchema.shape.phone.nullable(),
  role: staffRoleSchema,
  qualifications: createStaffBodySchema.shape.qualifications.nullable(),
  notes: createStaffBodySchema.shape.notes.nullable(),
  userId: idRef.nullable(),
});

export const listStaffQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(80).optional().describe('Substring of first or last name'),
  role: staffRoleSchema.optional(),
});

export const staffSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: staffRoleSchema,
  qualifications: z.string().nullable(),
  notes: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CreateStaffBody = z.infer<typeof createStaffBodySchema>;
export type UpdateStaffBody = z.infer<typeof updateStaffBodySchema>;
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
export type StaffDto = z.infer<typeof staffSchema>;
