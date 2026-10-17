"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useApiQuery } from "@/lib/api";
import type { ExpirationFilters, Expirations } from "./types";

/** Months shown by the timeline (the video shows OTT to MAR). */
export const TIMELINE_MONTHS = 6;

export function useExpirations(filters: ExpirationFilters, enabled = true) {
  return useApiQuery<Expirations>(["expirations", filters], "/documents/expirations", {
    query: { months: TIMELINE_MONTHS, teamId: filters.teamId, documentTypeId: filters.documentTypeId },
    placeholderData: keepPreviousData,
    enabled,
  });
}
