import { z } from 'zod';
import { roleSchema } from '../../shared/enums.js';

export const listUsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional().describe('Matches first name, last name or email'),
  role: roleSchema.optional(),
});

export const userListItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  roles: z.array(roleSchema),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UserListItem = z.infer<typeof userListItemSchema>;
