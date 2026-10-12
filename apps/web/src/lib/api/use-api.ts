"use client";

import {
  useMutation,
  useQuery,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "./instance";
import type { ApiClient, QueryParams } from "./client";
import type { ApiError } from "./errors";

type QueryExtras<T> = Omit<UseQueryOptions<T, ApiError, T, QueryKey>, "queryKey" | "queryFn">;

/**
 * GET data through TanStack Query.
 * `key` is `[resource, ...params]` (e.g. `["members", { team: "U16" }]`): the same key is used to invalidate after writes.
 */
export function useApiQuery<T>(
  key: QueryKey,
  path: string,
  options: { query?: QueryParams } & QueryExtras<T> = {},
): UseQueryResult<T, ApiError> {
  const { query, ...queryOptions } = options;
  return useQuery<T, ApiError, T, QueryKey>({
    queryKey: key,
    queryFn: ({ signal }) => api.get<T>(path, { query, signal }),
    ...queryOptions,
  });
}

/**
 * Write through TanStack Query. The mutation function receives the typed client;
 * on success invalidate the affected query keys (`onSuccess`) instead of patching caches by hand.
 */
export function useApiMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables, client: ApiClient) => Promise<TData>,
  options: Omit<UseMutationOptions<TData, ApiError, TVariables>, "mutationFn"> = {},
): UseMutationResult<TData, ApiError, TVariables> {
  return useMutation<TData, ApiError, TVariables>({
    mutationFn: (variables) => mutationFn(variables, api),
    ...options,
  });
}
