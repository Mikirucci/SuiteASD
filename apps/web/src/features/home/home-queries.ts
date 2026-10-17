"use client";

import { useMemo } from "react";
import type { CalendarEvent } from "@/features/calendario/types";
import { useAuth } from "@/features/auth/auth-provider";
import type { FeesSummary, FeePlan } from "@/features/quote/types";
import type { AppNotification } from "@/features/notifiche/types";
import type { MemberSummary } from "@/features/tesserati/types";
import { useApiQuery } from "@/lib/api";

const DAY_MS = 86_400_000;
export const UPCOMING_DAYS = 14;
/** Largest page the API serves: enough to count what happens in two weeks, or the unread enrolments. */
const COUNT_LIMIT = 100;

interface Listing<T> {
  data: T[];
  page: { hasMore: boolean };
}

/** What the signed-in user may open from the home: one flag per service the home talks to. */
export interface HomeAccess {
  members: boolean;
  documents: boolean;
  payments: boolean;
  events: boolean;
  convocations: boolean;
  competitions: boolean;
  notifications: boolean;
  automations: boolean;
  /** Unread "new enrolment" notifications exist only for the people who manage the enrolment links. */
  enrolments: boolean;
  /** Can create teams and links: the people who set a new society up. */
  setup: boolean;
  teamsWrite: boolean;
  joinLinksWrite: boolean;
}

export function useHomeAccess(): HomeAccess {
  const { me } = useAuth();
  const permissions = me?.permissions ?? [];
  const has = (permission: string): boolean => permissions.includes(permission);
  return {
    members: has("members:read"),
    documents: has("documents:read"),
    payments: has("payments:read"),
    events: has("events:read"),
    convocations: has("convocations:read"),
    competitions: has("competitions:read"),
    notifications: has("notifications:readOwn"),
    automations: has("automations:read"),
    enrolments: has("notifications:readOwn") && has("joinLinks:read"),
    setup: has("members:read") && has("teams:write"),
    teamsWrite: has("teams:write"),
    joinLinksWrite: has("joinLinks:write"),
  };
}

/** "Now", fixed for the hour: the key of a query stays stable between renders and moves on when the hour does. */
function useNowIso(): { iso: string; hourKey: string } {
  return useMemo(() => {
    const iso = new Date().toISOString();
    return { iso, hourKey: iso.slice(0, 13) };
  }, []);
}

export function useMembersSummary(enabled: boolean) {
  return useApiQuery<MemberSummary>(["members", "summary"], "/members/summary", { enabled });
}

export function useFeesSummary(enabled: boolean) {
  return useApiQuery<FeesSummary>(["fees-summary", { teamId: "" }], "/fees/summary", { enabled });
}

/** Scheduled events of the next two weeks, soonest first. */
export function useUpcomingEvents(enabled: boolean) {
  const { iso, hourKey } = useNowIso();
  const to = useMemo(() => new Date(new Date(iso).getTime() + UPCOMING_DAYS * DAY_MS).toISOString(), [iso]);
  return useApiQuery<Listing<CalendarEvent>>(["events", "home", hourKey], "/events", {
    query: { from: iso, to, status: "SCHEDULED", limit: COUNT_LIMIT },
    enabled,
  });
}

/** The next match, whenever it is: its convocations are what the home asks about. */
export function useNextMatch(enabled: boolean) {
  const { iso, hourKey } = useNowIso();
  return useApiQuery<Listing<CalendarEvent>>(["events", "home-next-match", hourKey], "/events", {
    query: { from: iso, type: "MATCH", status: "SCHEDULED", limit: 1 },
    enabled,
  });
}

/** Enrolments through a link that the administration has not read yet. */
export function useNewEnrolments(enabled: boolean) {
  return useApiQuery<Listing<AppNotification>>(["notifications", "home-enrolments"], "/notifications", {
    query: { type: "ADMIN_NEW_ENROLMENT", unread: true, limit: COUNT_LIMIT },
    enabled,
  });
}

/** Does the society have at least one fee plan? */
export function useFeePlanProbe(enabled: boolean) {
  return useApiQuery<Listing<FeePlan>>(["fee-plans", "probe"], "/fee-plans", { query: { limit: 1 }, enabled });
}

/** Does the calendar have at least one event, past or future? */
export function useAnyEventProbe(enabled: boolean) {
  return useApiQuery<Listing<CalendarEvent>>(["events", "probe"], "/events", { query: { limit: 1 }, enabled });
}
