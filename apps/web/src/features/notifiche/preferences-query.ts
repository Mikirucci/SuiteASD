"use client";

import { useApiQuery } from "@/lib/api";
import { NOTIFICATION_TYPES } from "./catalog";
import type { NotificationType, PreferencesResponse } from "./types";

export const PREFERENCES_KEY = ["notifications", "preferences"] as const;

/** Every (type, channel) preference of the signed-in user: the API only lists the types of their roles. */
export function useNotificationPreferences() {
  return useApiQuery<PreferencesResponse>(PREFERENCES_KEY, "/notifications/preferences");
}

/** The notification types offered to the user, in the display order of the catalog. */
export function offeredTypes(data: PreferencesResponse | undefined): NotificationType[] {
  const offered = new Set(data?.preferences.map((item) => item.type));
  return NOTIFICATION_TYPES.filter((type) => offered.has(type));
}
