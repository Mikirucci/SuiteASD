"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useApiQuery } from "@/lib/api";
import type { ExpirationFilters, Expirations, TypePeople, TypePeopleFilters, TypeReport } from "./types";

/** Months of upcoming expiries listed for athletes and guardians. */
export const EXPIRATION_MONTHS = 6;

/** People shown per page of a document type. */
export const PEOPLE_PAGE_SIZE = 20;

export function useExpirations(filters: ExpirationFilters, enabled = true) {
  return useApiQuery<Expirations>(["expirations", filters], "/documents/expirations", {
    query: { months: EXPIRATION_MONTHS, teamId: filters.teamId, documentTypeId: filters.documentTypeId },
    placeholderData: keepPreviousData,
    enabled,
  });
}

// Keys start with "expirations": uploading or editing a document refreshes all of them.

export function useTypeReport(enabled = true) {
  return useApiQuery<TypeReport>(["expirations", "type-report"], "/document-types/report", { enabled });
}

export function useTypePeople(typeId: string, filters: TypePeopleFilters) {
  return useApiQuery<TypePeople>(["expirations", "type-people", typeId, filters], `/document-types/${typeId}/people`, {
    query: { q: filters.q || undefined, teamId: filters.teamId || undefined, status: filters.status || undefined, page: filters.page, pageSize: PEOPLE_PAGE_SIZE },
    placeholderData: keepPreviousData,
  });
}
