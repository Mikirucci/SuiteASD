import type { Page } from "@playwright/test";
import {
  GIULIA,
  MATCH_CONVOCATIONS,
  MATCH_EVENT,
  NOW,
  PAST_TRAINING,
  PALAZZETTO,
  PALESTRA,
  ROSTER,
  SARA,
  TEAM_ATTENDANCE,
  TRAINING_EVENT,
  attendanceSheet,
} from "../../src/features/calendario/test-fixtures";
import type { CalendarEvent, Convocation, ConvocationSummary } from "../../src/features/calendario/types";
import type { ApiAnswer, ApiHandler } from "./route-api";
import { pageOf } from "./route-api";

/** Network-level backend of the calendar module for the e2e spec: events, squad, own convocations and attendance. */

export const COACH = [
  "events:read",
  "events:write",
  "convocations:readOwn",
  "convocations:read",
  "convocations:write",
  "attendance:read",
  "attendance:write",
  "teams:read",
  "venues:read",
  "competitions:read",
  "members:read",
];
export const ATHLETE = ["events:read", "convocations:readOwn", "convocations:respond", "teams:read", "venues:read", "competitions:read"];

/** The day the browser is set to: Thursday 12 November 2026, 10:00. */
export const FROZEN_NOW = NOW;

const TEAMS = [
  { id: "t-sd", name: "Serie D", category: "Serie D" },
  { id: "t-u16", name: "U16", category: "U16" },
];

const SERVER_ERROR: ApiAnswer = { status: 500, body: { type: "about:blank", title: "Error", status: 500, code: "internal" } };
const NOT_FOUND: ApiAnswer = { status: 404, body: { type: "about:blank", title: "Not Found", status: 404, code: "not_found" } };

function summaryOf(rows: readonly Convocation[], capacity: number): ConvocationSummary {
  const count = (status: Convocation["status"]) => rows.filter((row) => row.status === status).length;
  return { confirmed: count("CONFIRMED"), declined: count("DECLINED"), pending: count("PENDING"), total: rows.length, capacity };
}

export interface CalendarBackendOptions {
  /** How many times `GET /events` answers 500 before working (React Query retries twice: 3 makes the screen fail). */
  eventsFailures?: number;
  /** An athlete sees only the own convocation; a coach sees the whole squad. */
  viewer?: "coach" | "athlete";
}

export interface CalendarBackendState {
  events: CalendarEvent[];
  squad: Convocation[];
  eventsFailures: number;
}

export function calendarBackend({ eventsFailures = 0, viewer = "coach" }: CalendarBackendOptions = {}) {
  const state: CalendarBackendState = {
    events: [TRAINING_EVENT, MATCH_EVENT, PAST_TRAINING],
    // The athlete of the athlete view still has to answer
    squad: MATCH_CONVOCATIONS.map((row) =>
      viewer === "athlete" && row.member.id === GIULIA.id ? { ...row, status: "PENDING" as const, respondedAt: null } : { ...row },
    ),
    eventsFailures,
  };
  const own = (): Convocation[] => state.squad.filter((row) => row.member.id === GIULIA.id);
  const eventOf = (id: string | undefined) => state.events.find((event) => event.id === id);
  let created = 0;

  const handler: ApiHandler = ({ method, path, query, body }) => {
    const key = `${method} ${path}`;
    const eventPath = /^\/events\/([^/]+)(\/[a-z/]+)?$/.exec(path);
    const input = (body ?? {}) as Record<string, unknown>;

    switch (key) {
      case "GET /events": {
        if (state.eventsFailures > 0) {
          state.eventsFailures -= 1;
          return SERVER_ERROR;
        }
        const [from, to, type, teamId] = ["from", "to", "type", "teamId"].map((name) => query.get(name));
        return pageOf(
          state.events.filter(
            (event) =>
              (!from || event.startsAt >= from) &&
              (!to || event.startsAt < to) &&
              (!type || event.type === type) &&
              (!teamId || event.team?.id === teamId),
          ),
        );
      }
      case "POST /events": {
        created += 1;
        const recurrence = input.recurrence as { count?: number } | undefined;
        const event: CalendarEvent = {
          ...TRAINING_EVENT,
          id: `ev-new-${created}`,
          type: input.type as CalendarEvent["type"],
          title: String(input.title),
          startsAt: String(input.startsAt),
          endsAt: typeof input.endsAt === "string" ? input.endsAt : null,
          team: TEAMS.find((team) => team.id === input.teamId) ?? null,
          venue: input.venueId === PALESTRA.id ? PALESTRA : input.venueId === PALAZZETTO.id ? PALAZZETTO : null,
        };
        state.events.push(event);
        return { status: 201, body: { ...event, occurrencesCreated: recurrence?.count ?? 1 } };
      }
      case "GET /teams":
        return pageOf(TEAMS);
      case "GET /venues":
        return pageOf([PALAZZETTO, PALESTRA]);
      case "GET /competitions":
        return pageOf([{ id: "c1", name: "Serie D" }]);
      case "GET /competitions/c1/groups":
        return pageOf([{ id: "g1", name: "Girone B" }]);
      case "GET /competitions/c1/groups/g1/matches":
        return pageOf([{ eventId: MATCH_EVENT.id, round: 6 }]);
      case "GET /members":
        return pageOf(ROSTER);
      case "GET /convocations":
        return pageOf(own().filter((row) => query.get("status") !== "PENDING" || row.status === "PENDING"));
      case "GET /events/ev-past/attendance":
        return { body: attendanceSheet([true, null, null]) };
      case "PUT /events/ev-past/attendance":
        return { body: attendanceSheet([true, true, false]) };
      case "GET /teams/t-sd/attendance":
        return { body: TEAM_ATTENDANCE };
      case "GET /members/m-sara/attendance":
        return {
          body: {
            member: SARA,
            summary: { present: 5, total: 8, percentage: 62.5 },
            data: [{ eventId: PAST_TRAINING.id, title: "Allenamento", startsAt: PAST_TRAINING.startsAt, present: true, note: null }],
            page: { nextCursor: null, hasMore: false },
          },
        };
      default:
        break;
    }

    const response = /^\/convocations\/([^/]+)\/response$/.exec(path);
    if (method === "PUT" && response) {
      const target = state.squad.find((row) => row.id === response[1]);
      if (!target) return NOT_FOUND;
      const status = input.status === "DECLINED" ? "DECLINED" : "CONFIRMED";
      const updated: Convocation = { ...target, status, declineReason: typeof input.reason === "string" ? input.reason : null };
      state.squad = state.squad.map((row) => (row.id === updated.id ? updated : row));
      return { body: updated };
    }

    if (!eventPath) return undefined;
    const event = eventOf(eventPath[1]);
    if (!event) return NOT_FOUND;
    const action = eventPath[2] ?? "";
    const rows = event.id === MATCH_EVENT.id ? (viewer === "coach" ? state.squad : own()) : [];

    switch (`${method}${action}`) {
      case "GET/convocations":
        return { body: { data: rows, summary: summaryOf(state.squad, event.convocations.capacity) } };
      case "POST/convocations/remind":
        return { body: { eventId: event.id, reminded: state.squad.filter((row) => row.status === "PENDING").length, notified: 4 } };
      case "PATCH": {
        const updated: CalendarEvent = {
          ...event,
          title: typeof input.title === "string" ? input.title : event.title,
          startsAt: typeof input.startsAt === "string" ? input.startsAt : event.startsAt,
          endsAt: input.endsAt === undefined ? event.endsAt : (input.endsAt as string | null),
          venue: input.venueId === PALAZZETTO.id ? PALAZZETTO : input.venueId === PALESTRA.id ? PALESTRA : event.venue,
          status: "POSTPONED",
        };
        state.events = state.events.map((item) => (item.id === updated.id ? updated : item));
        return { body: updated };
      }
      case "POST/cancel": {
        const cancelled: CalendarEvent = { ...event, status: "CANCELLED" };
        state.events = state.events.map((item) => (item.id === cancelled.id ? cancelled : item));
        return { body: cancelled };
      }
      default:
        return undefined;
    }
  };

  return { state, handler };
}

/** The iCal export answers with a text file: `routeApi` only speaks JSON, so this route comes on top of it. */
export async function routeIcalExport(page: Page): Promise<void> {
  await page.route("**/api/v1/events/export.ics*", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "http://localhost:3000",
        "access-control-expose-headers": "content-disposition",
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'attachment; filename="calendario.ics"',
      },
      body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n",
    });
  });
}
