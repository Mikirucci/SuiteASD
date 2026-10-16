"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useApiQuery, type ApiError } from "@/lib/api";

interface UnreadCount {
  count: number;
}

/** Root of every notifications query: invalidating it refreshes the list, the counter and the navigation badge. */
export const NOTIFICATIONS_KEY = ["notifications"] as const;

export const UNREAD_REFETCH_MS = 60_000;

/** Unread notifications of the signed-in user (GET /notifications/unread-count), polled while the tab is visible. */
export function useUnreadCount(options: { enabled?: boolean } = {}): UseQueryResult<UnreadCount, ApiError> {
  return useApiQuery<UnreadCount>([...NOTIFICATIONS_KEY, "unread-count"], "/notifications/unread-count", {
    enabled: options.enabled,
    refetchInterval: UNREAD_REFETCH_MS,
  });
}
