"use client";

import { useCursorQuery, type CursorQueryResult } from "@/lib/use-cursor-query";
import { useApiQuery } from "@/lib/api";
import type { FeePlan, PersonPaymentStatus, PlanPeople, PlanReport, TeamOption } from "./types";

// Every key starts with "fee-plans" so that registering a payment or generating fees refreshes them all.

export function useFeePlans(): CursorQueryResult<FeePlan> {
  return useCursorQuery<FeePlan>(["fee-plans", "list"], "/fee-plans", { limit: 50 });
}

export function usePlanReport() {
  return useApiQuery<PlanReport>(["fee-plans", "report"], "/fee-plans/report");
}

export function useQuoteTeams(enabled = true): CursorQueryResult<TeamOption> {
  return useCursorQuery<TeamOption>(["quote-teams"], "/teams", { limit: 100 }, { enabled });
}

export interface PlanPeopleFilters {
  q: string;
  teamId: string;
  status: PersonPaymentStatus | "";
}

export function usePlanPeople(planId: string, filters: PlanPeopleFilters) {
  return useApiQuery<PlanPeople>(["fee-plans", "people", planId, filters], `/fee-plans/${planId}/people`, {
    query: { q: filters.q || undefined, teamId: filters.teamId || undefined, status: filters.status || undefined },
    placeholderData: (previous) => previous,
  });
}

export function useFeePlan(planId: string) {
  return useApiQuery<FeePlan>(["fee-plans", "detail", planId], `/fee-plans/${planId}`);
}
