"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useApiQuery } from "@/lib/api";
import type { ExpirationFilters, Expirations, TypePeople, TypePeopleFilters, TypeReport } from "./types";

/** Months shown by the timeline (the video shows OTT to MAR). */
export const TIMELINE_MONTHS = 6;

export function useExpirations(filters: ExpirationFilters, enabled = true) {
  return useApiQuery<Expirations>(["expirations", filters], "/documents/expirations", {
    query: { months: TIMELINE_MONTHS, teamId: filters.teamId, documentTypeId: filters.documentTypeId },
    placeholderData: keepPreviousData,
    enabled,
  });
}

// Keys start with "expirations": uploading or editing a document refreshes them together with the timeline.

export function useTypeReport(enabled = true) {
  return useApiQuery<TypeReport>(["expirations", "type-report"], "/document-types/report", { enabled });
}

export function useTypePeople(typeId: string, filters: TypePeopleFilters) {
  return useApiQuery<TypePeople>(["expirations", "type-people", typeId, filters], `/document-types/${typeId}/people`, {
    query: { q: filters.q || undefined, teamId: filters.teamId || undefined, status: filters.status || undefined },
    placeholderData: keepPreviousData,
  });
}
