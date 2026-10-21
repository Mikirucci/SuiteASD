"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, useApiQuery, type ApiError } from "@/lib/api";
import { NOTIFICATIONS_KEY } from "@/hooks/use-unread-count";
import { fetchAllPages, useAllPages } from "@/lib/use-all-pages";
import { weekRange } from "./format";
import type {
  CalendarEvent,
  Convocation,
  EventConvocations,
  AttendanceSheet,
  MatchContext,
  MemberAttendanceHistory,
  RosterMember,
  TeamAttendanceSummary,
  TeamOption,
  VenueOption,
} from "./types";

// ---- lookups -------------------------------------------------------------------------------------------------------

export function useCalendarTeams() {
  return useAllPages<TeamOption>(["calendar-teams"], "/teams");
}

export function useCalendarVenues() {
  return useAllPages<VenueOption>(["calendar-venues"], "/venues");
}

/** Active athletes of a team: the people an event can convocate. */
export function useTeamRoster(teamId: string | null) {
  return useAllPages<RosterMember>(["calendar-roster", teamId], teamId ? "/members" : null, {
    teamId: teamId ?? undefined,
    status: "ACTIVE",
  });
}

// ---- events --------------------------------------------------------------------------------------------------------

/** Events of the week that contains `day`, optionally for one team. */
export function useWeekEvents(day: Date, teamId: string) {
  const { from, to } = weekRange(day);
  return useAllPages<CalendarEvent>(["events", "week", { from, to, teamId }], "/events", {
    from,
    to,
    teamId: teamId || undefined,
  });
}

interface CompetitionRef {
  id: string;
  name: string;
}
interface GroupRef {
  id: string;
  name: string;
}
interface MatchRef {
  eventId: string | null;
  round: number | null;
}

/**
 * Competition, group and round of every match that has a calendar event: the events carry no such data, so the match
 * cards ask the competitions module. It is decoration: when it fails the cards just show the team name.
 */
export function useMatchContexts(enabled: boolean) {
  return useQuery<Record<string, MatchContext>, ApiError>({
    queryKey: ["match-contexts"],
    enabled,
    queryFn: async ({ signal }) => {
      const contexts: Record<string, MatchContext> = {};
      const competitions = await fetchAllPages<CompetitionRef>("/competitions", {}, signal);
      await Promise.all(
        competitions.map(async (competition) => {
          const groups = await fetchAllPages<GroupRef>(`/competitions/${competition.id}/groups`, {}, signal);
          await Promise.all(
            groups.map(async (group) => {
              const matches = await fetchAllPages<MatchRef>(
                `/competitions/${competition.id}/groups/${group.id}/matches`,
                {},
                signal,
              );
              for (const match of matches) {
                if (match.eventId) contexts[match.eventId] = { competition: competition.name, group: group.name, round: match.round };
              }
            }),
          );
        }),
      );
      return contexts;
    },
  });
}

// ---- convocations --------------------------------------------------------------------------------------------------

export function useEventConvocations(eventId: string) {
  return useApiQuery<EventConvocations>(["event-convocations", eventId], `/events/${eventId}/convocations`);
}

/** Convocations the user still has to answer (athletes and guardians; the API only returns their own). */
export function usePendingConvocations(enabled: boolean) {
  return useAllPages<Convocation>(
    ["my-convocations"],
    enabled ? "/convocations" : null,
    { upcoming: true, status: "PENDING" },
  );
}

/** Everything that shows events or convocations must refresh after a write on either, notifications included. */
export function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["events"] }),
      queryClient.invalidateQueries({ queryKey: ["event-convocations"] }),
      queryClient.invalidateQueries({ queryKey: ["my-convocations"] }),
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
    ]);
  };
}

// ---- attendance ----------------------------------------------------------------------------------------------------

export function useAttendanceSheet(eventId: string | null) {
  return useApiQuery<AttendanceSheet>(["attendance", "sheet", eventId], `/events/${eventId}/attendance`, {
    enabled: eventId !== null,
  });
}

export function useTeamAttendance(teamId: string | null, from: string | undefined) {
  return useApiQuery<TeamAttendanceSummary>(["attendance", "team", teamId, from], `/teams/${teamId}/attendance`, {
    query: { from },
    enabled: teamId !== null,
  });
}

/** History of one athlete: the summary comes with every page, the rows are appended page after page. */
export function useMemberAttendance(memberId: string) {
  const result = useInfiniteQuery<MemberAttendanceHistory, ApiError, { pages: MemberAttendanceHistory[] }, unknown[], string | null>({
    queryKey: ["attendance", "member", memberId],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      api.get<MemberAttendanceHistory>(`/members/${memberId}/attendance`, { query: { cursor: pageParam }, signal }),
    getNextPageParam: (last) => (last.page.hasMore ? last.page.nextCursor : undefined),
  });
  const first = result.data?.pages[0];
  return {
    member: first?.member,
    summary: first?.summary,
    rows: result.data?.pages.flatMap((page) => page.data),
    isLoading: result.isLoading,
    error: result.data ? null : result.error,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
    fetchNextPage: () => void result.fetchNextPage(),
    refetch: () => void result.refetch(),
  };
}
