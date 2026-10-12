import { z } from 'zod';
import { badRequest } from './errors.js';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Query params shared by every list endpoint: `?limit=25&cursor=<opaque>`.
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).max(512).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Response envelope of every list endpoint: `{ data: [...], page: { nextCursor, hasMore } }`.
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
  });
}

export interface Page<T> {
  data: T[];
  page: { nextCursor: string | null; hasMore: boolean };
}

function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const result = z.object({ id: z.string().min(1) }).safeParse(parsed);
    if (result.success) return result.data.id;
  } catch {
    // fall through to the error below
  }
  throw badRequest('invalid_cursor', 'The pagination cursor is not valid');
}

// Spread into a Prisma `findMany` call. The query MUST have a deterministic `orderBy` ending with `{ id: 'asc' }`.
export function cursorArgs(query: PaginationQuery): { take: number; skip?: number; cursor?: { id: string } } {
  if (query.cursor === undefined) return { take: query.limit + 1 };
  return { take: query.limit + 1, skip: 1, cursor: { id: decodeCursor(query.cursor) } };
}

// Turns the `limit + 1` rows fetched with `cursorArgs` into a page.
export function toPage<T extends { id: string }>(rows: T[], query: PaginationQuery): Page<T> {
  const hasMore = rows.length > query.limit;
  const data = hasMore ? rows.slice(0, query.limit) : rows;
  const last = data.at(-1);
  return { data, page: { nextCursor: hasMore && last ? encodeCursor(last.id) : null, hasMore } };
}
