"use client";

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { api, type ApiError } from "@/lib/api";

interface UnreadCount {
  count: number;
}

/** Root of every notifications query: invalidating it refreshes the list, the counter and the navigation badge. */
export const NOTIFICATIONS_KEY = ["notifications"] as const;

const UNREAD_COUNT_KEY = [...NOTIFICATIONS_KEY, "unread-count"] as const;

export const UNREAD_REFETCH_MS = 30_000;

/**
 * Unread notifications of the signed-in user (GET /notifications/unread-count). It is the one poll of the notification
 * system: it runs every 30 s while the tab is visible and again when the person comes back to the window (the app turns
 * focus refetching off by default). When the counter moves, the lists built on `NOTIFICATIONS_KEY` (centre, home
 * preview) are refetched too, so a badge never announces notifications the page does not show.
 */
export function useUnreadCount(options: { enabled?: boolean } = {}): UseQueryResult<UnreadCount, ApiError> {
  const queryClient = useQueryClient();
  return useQuery<UnreadCount, ApiError>({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async ({ signal }) => {
      const previous = queryClient.getQueryData<UnreadCount>(UNREAD_COUNT_KEY);
      const current = await api.get<UnreadCount>("/notifications/unread-count", { signal });
      if (previous !== undefined && previous.count !== current.count) {
        void queryClient.invalidateQueries({
          queryKey: NOTIFICATIONS_KEY,
          predicate: (query) => query.queryKey[1] !== UNREAD_COUNT_KEY[1],
        });
      }
      return current;
    },
    enabled: options.enabled,
    refetchInterval: UNREAD_REFETCH_MS,
    refetchOnWindowFocus: "always",
  });
}
