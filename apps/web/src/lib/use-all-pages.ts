"use client";

import { useQuery, type QueryKey, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api/instance";
import type { QueryParams } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";

/** Envelope of every list endpoint: cursor pagination. */
export interface Page<T> {
  data: T[];
  page: { nextCursor: string | null; hasMore: boolean };
}

const PAGE_SIZE = 100;
/** Safety net against a server that keeps answering hasMore: 100 x 100 rows is far above any club's data. */
const MAX_PAGES = 100;

export async function fetchAllPages<T>(path: string, query: QueryParams, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const page = await api.get<Page<T>>(path, { query: { ...query, limit: PAGE_SIZE, cursor }, signal });
    items.push(...page.data);
    if (!page.page.hasMore || !page.page.nextCursor) break;
    cursor = page.page.nextCursor;
  }
  return items;
}

/**
 * GET a whole cursor-paginated collection as one array (clubs have tens of seasons, groups or matches, not thousands).
 * Pass `path = null` to keep the query idle until a parent selection exists.
 */
export function useAllPages<T>(key: QueryKey, path: string | null, query: QueryParams = {}): UseQueryResult<T[], ApiError> {
  return useQuery<T[], ApiError, T[], QueryKey>({
    queryKey: key,
    queryFn: ({ signal }) => fetchAllPages<T>(path ?? "", query, signal),
    enabled: path !== null,
  });
}
