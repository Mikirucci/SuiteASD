import type { Match, PointsRules, Tiebreaker } from "./types";

const dateFormat = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

/** "sab 14 nov, 20:30" */
export function formatMatchDate(iso: string): string {
  const date = new Date(iso);
  return `${dateFormat.format(date)}, ${timeFormat.format(date)}`;
}

/** "14 novembre 2026" */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** "3-1" for a played match, null otherwise. */
export function scoreOf(match: Pick<Match, "homeSets" | "awaySets">): string | null {
  return match.homeSets === null || match.awaySets === null ? null : `${match.homeSets}-${match.awaySets}`;
}

/** "Aquile Volley 3-1 Delfini Volley" or "Aquile Volley - Delfini Volley" before the result. */
export function matchTitle(match: Pick<Match, "homeTeam" | "awayTeam" | "homeSets" | "awaySets">): string {
  const score = scoreOf(match);
  return `${match.homeTeam.name} ${score ?? "-"} ${match.awayTeam.name}`;
}

export function formatRatio(ratio: number | null): string {
  return ratio === null ? "-" : ratio.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const TIEBREAKER_LABELS: Record<Tiebreaker, string> = {
  WINS: "vittorie",
  SET_RATIO: "quoziente set",
  POINT_RATIO: "quoziente punti",
};

export function describeTiebreakers(tiebreakers: readonly Tiebreaker[]): string {
  return tiebreakers.length === 0 ? "ordine alfabetico" : tiebreakers.map((rule) => TIEBREAKER_LABELS[rule]).join(", poi ");
}

/** "3-0: 3 a 0, 3-1: 3 a 0, 3-2: 2 a 1" (winner points to loser points). */
export function describePointsRules(rules: PointsRules): string {
  return (["3-0", "3-1", "3-2"] as const).map((score) => `${score}: ${rules[score][0]} a ${rules[score][1]}`).join(", ");
}

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local "YYYY-MM-DD" for <input type="date">. */
export function toDateInput(iso: string): string {
  return toLocalInput(iso).slice(0, 10);
}

/** Inverse of toLocalInput: ISO UTC string, or undefined for an empty field. */
export function fromLocalInput(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}
