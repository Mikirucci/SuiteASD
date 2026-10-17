import type { Team } from "@/features/tesserati/types";
import { TEAM_GENDER_LABEL, isTeamGender } from "./team-schema";

export function genderLabelOf(team: Pick<Team, "gender">): string | null {
  return isTeamGender(team.gender) ? TEAM_GENDER_LABEL[team.gender] : null;
}

/** The quiet line under a team name: category (unless it repeats the name) and gender, "U16, Femminile". */
export function teamMeta(team: Pick<Team, "name" | "category" | "gender">): string {
  const category = team.category && team.category !== team.name ? team.category : null;
  return [category, genderLabelOf(team)].filter((part): part is string => Boolean(part)).join(", ");
}

const startFormat = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "sab 14 nov, 20:30". */
export function formatEventStart(iso: string): string {
  return startFormat.format(new Date(iso));
}
