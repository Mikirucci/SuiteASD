import type { CertificateStatus, LatestResult, TeamCount, UpcomingEvent } from "./types";

/** Statuses from the one that needs action first to the healthy one. */
export const CERTIFICATE_ORDER: readonly CertificateStatus[] = ["EXPIRED", "MISSING", "EXPIRING", "OK"];

/** Largest team first; equal sizes fall back to the name so the order never jumps between loads. */
export function sortTeams(teams: readonly TeamCount[]): TeamCount[] {
  return [...teams].sort((a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName, "it"));
}

/** Nearest event first. */
export function sortEvents(events: readonly UpcomingEvent[]): UpcomingEvent[] {
  return [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Most recent result first; results without a date go last. */
export function sortResults(results: readonly LatestResult[]): LatestResult[] {
  const time = (result: LatestResult) => (result.playedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(result.playedAt));
  return [...results].sort((a, b) => {
    const [first, second] = [time(a), time(b)];
    if (first === second) return 0;
    return first < second ? 1 : -1;
  });
}
