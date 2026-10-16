import { json, page, type stubApi } from "@/test/stub-api";
import {
  MATCH_CONVOCATIONS_RESPONSE,
  PALAZZETTO,
  PALESTRA,
  ROSTER,
  WEEK_EVENTS,
} from "./test-fixtures";

/** Route table of the calendar tests (network stub and providers come from @/test/stub-api). */
export const TEAMS = [
  { id: "t-sd", name: "Serie D", category: "Serie D" },
  { id: "t-u16", name: "U16", category: "U16" },
];

type Routes = Parameters<typeof stubApi>[0];

/** The endpoints a coach's calendar reads; tests override or add the ones they exercise. */
export function calendarRoutes(extra: Routes = {}): Routes {
  return {
    "GET /events": () => json(200, page(WEEK_EVENTS)),
    "GET /teams": () => json(200, page(TEAMS)),
    "GET /venues": () => json(200, page([PALAZZETTO, PALESTRA])),
    "GET /competitions": () => json(200, page([{ id: "c1", name: "Serie D" }])),
    "GET /competitions/c1/groups": () => json(200, page([{ id: "g1", name: "Girone B" }])),
    "GET /competitions/c1/groups/g1/matches": () => json(200, page([{ eventId: "ev-match", round: 6 }])),
    "GET /events/ev-match/convocations": () => json(200, MATCH_CONVOCATIONS_RESPONSE),
    "GET /members": () => json(200, page(ROSTER)),
    ...extra,
  };
}
