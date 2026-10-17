"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { CalendarEvent } from "@/features/calendario/types";
import type { Fee, FeesSummary } from "@/features/quote/types";
import type { CursorPage, MemberListItem, Team } from "@/features/tesserati/types";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { addDays, toDayKey } from "@/lib/dates";
import { useAllPages } from "@/lib/use-all-pages";
import { useCursorQuery } from "@/lib/use-cursor-query";
import type { CreateTeamBody, UpdateTeamBody } from "./team-schema";

const ROSTER_PAGE_SIZE = 25;
const NEXT_APPOINTMENTS = 5;
/** How far ahead the cards look for the next event of each team. */
export const UPCOMING_DAYS = 30;

/** Every team of the society (a club has tens, not thousands): filters and counters work on the whole list. */
export function useAllTeams() {
  return useAllPages<Team>(["teams", "manage"], "/teams");
}

export function useTeam(id: string) {
  return useApiQuery<Team>(["teams", "detail", id], `/teams/${id}`);
}

export type NextEventState =
  | { status: "pending" }
  /** The events could not be loaded: the cards say nothing rather than claiming there are none. */
  | { status: "unavailable" }
  | { status: "ready"; byTeam: ReadonlyMap<string, CalendarEvent> };

/** The first scheduled event of each team in the coming days, from a single request. */
export function useNextEventByTeam(): NextEventState {
  // Fixed when the page opens: a new instant on every render would change the request forever
  const [span] = useState(() => {
    const now = new Date();
    return { day: toDayKey(now), from: now.toISOString(), to: addDays(now, UPCOMING_DAYS).toISOString() };
  });
  const events = useAllPages<CalendarEvent>(["events", "next-by-team", span.day], "/events", {
    from: span.from,
    to: span.to,
    status: "SCHEDULED",
  });
  return useMemo<NextEventState>(() => {
    if (events.isPending) return { status: "pending" };
    if (events.error || !events.data) return { status: "unavailable" };
    const byTeam = new Map<string, CalendarEvent>();
    // The API answers by start time: the first event met for a team is its next one
    for (const event of events.data) if (event.team && !byTeam.has(event.team.id)) byTeam.set(event.team.id, event);
    return { status: "ready", byTeam };
  }, [events.isPending, events.error, events.data]);
}

/** The members of a team, optionally narrowed by a search; "load more" appends the next page. */
export function useTeamRoster(teamId: string, search: string, enabled: boolean) {
  return useCursorQuery<MemberListItem>(
    ["members", "team-roster", teamId, search],
    "/members",
    { teamId, q: search, limit: ROSTER_PAGE_SIZE },
    { enabled },
  );
}

/** The next appointments of a team. */
export function useTeamAppointments(teamId: string, enabled: boolean) {
  // Fixed when the page opens, see useNextEventByTeam
  const [opened] = useState(() => {
    const now = new Date();
    return { day: toDayKey(now), from: now.toISOString() };
  });
  return useApiQuery<CursorPage<CalendarEvent>>(["events", "team-appointments", teamId, opened.day], "/events", {
    query: { teamId, status: "SCHEDULED", from: opened.from, limit: NEXT_APPOINTMENTS },
    enabled,
  });
}

export function useTeamFeesSummary(teamId: string, enabled: boolean) {
  return useApiQuery<FeesSummary>(["fees", "team-summary", teamId], "/fees/summary", {
    query: { teamId },
    enabled,
  });
}

export interface UnpaidAmounts {
  overdueCents: number;
  pendingCents: number;
}

export interface TeamUnpaidFees {
  byMember: ReadonlyMap<string, UnpaidAmounts>;
  isLoading: boolean;
  /** Unpaid fees could not be loaded: the roster is still shown, without the fee column values. */
  failed: boolean;
}

function sumByMember(fees: readonly Fee[] | undefined, key: keyof UnpaidAmounts, into: Map<string, UnpaidAmounts>) {
  for (const fee of fees ?? []) {
    const current = into.get(fee.memberId) ?? { overdueCents: 0, pendingCents: 0 };
    into.set(fee.memberId, { ...current, [key]: current[key] + fee.amountCents });
  }
}

/** Fees still to pay for the members of a team, summed per member (overdue and not yet due are separate). */
export function useTeamUnpaidFees(teamId: string, enabled: boolean): TeamUnpaidFees {
  const overdue = useAllPages<Fee>(["fees", "team-unpaid", teamId, "OVERDUE"], enabled ? "/fees" : null, {
    teamId,
    status: "OVERDUE",
  });
  const pending = useAllPages<Fee>(["fees", "team-unpaid", teamId, "PENDING"], enabled ? "/fees" : null, {
    teamId,
    status: "PENDING",
  });
  return useMemo(() => {
    const byMember = new Map<string, UnpaidAmounts>();
    sumByMember(overdue.data, "overdueCents", byMember);
    sumByMember(pending.data, "pendingCents", byMember);
    return {
      byMember,
      isLoading: enabled && (overdue.isPending || pending.isPending) && !overdue.error && !pending.error,
      failed: Boolean(overdue.error ?? pending.error),
    };
  }, [enabled, overdue.data, overdue.error, overdue.isPending, pending.data, pending.error, pending.isPending]);
}

/** Teams feed the member filters and forms, and the member counts: refresh them all after a write. */
function useInvalidateTeams() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
      queryClient.invalidateQueries({ queryKey: ["members"] }),
    ]);
  };
}

export function useCreateTeam() {
  const invalidate = useInvalidateTeams();
  return useApiMutation((body: CreateTeamBody, client) => client.post<Team>("/teams", body), { onSuccess: invalidate });
}

export function useUpdateTeam(id: string) {
  const invalidate = useInvalidateTeams();
  return useApiMutation((body: UpdateTeamBody, client) => client.patch<Team>(`/teams/${id}`, body), {
    onSuccess: invalidate,
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTeams();
  return useApiMutation((id: string, client) => client.delete<void>(`/teams/${id}`), {
    onSuccess: (_result, id) => {
      // The page being left must not refetch a team that no longer exists
      queryClient.removeQueries({ queryKey: ["teams", "detail", id] });
      return invalidate();
    },
  });
}
