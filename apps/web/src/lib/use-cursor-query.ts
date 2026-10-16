"use client";

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { api, type ApiError, type QueryParams } from "@/lib/api";
import type { Page as CursorPage } from "./use-all-pages";

export interface CursorQueryResult<T> {
  items: T[] | undefined;
  isLoading: boolean;
  /** Error of the first page: the list cannot be shown. */
  error: ApiError | null;
  /** Error while loading a further page: the pages already loaded stay visible. */
  nextPageError: ApiError | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

/** Cursor-paginated GET (`{data, page:{nextCursor,hasMore}}`) flattened into a single list. */
export function useCursorQuery<T>(
  key: QueryKey,
  path: string,
  query: QueryParams = {},
  options: { enabled?: boolean } = {},
): CursorQueryResult<T> {
  const result = useInfiniteQuery<CursorPage<T>, ApiError, { pages: CursorPage<T>[] }, QueryKey, string | null>({
    queryKey: key,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => api.get<CursorPage<T>>(path, { query: { ...query, cursor: pageParam }, signal }),
    getNextPageParam: (last) => (last.page.hasMore ? last.page.nextCursor : undefined),
    enabled: options.enabled,
  });

  const loadedFirstPage = result.data !== undefined;
  return {
    items: result.data?.pages.flatMap((page) => page.data),
    isLoading: result.isLoading,
    error: loadedFirstPage ? null : result.error,
    nextPageError: loadedFirstPage && result.isFetchNextPageError ? result.error : null,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
    fetchNextPage: () => void result.fetchNextPage(),
    refetch: () => void result.refetch(),
  };
}
