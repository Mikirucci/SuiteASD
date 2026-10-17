import type { Team } from "@/features/tesserati/types";
import type { TeamGender } from "./team-schema";

export interface TeamFilters {
  q: string;
  category: string;
  gender: TeamGender | "";
}

export const EMPTY_TEAM_FILTERS: TeamFilters = { q: "", category: "", gender: "" };

export function hasActiveFilters(filters: TeamFilters): boolean {
  return filters.q.trim() !== "" || filters.category !== "" || filters.gender !== "";
}

/** Search matches the name or the category, ignoring case; category and gender must match exactly. */
export function filterTeams(teams: readonly Team[], filters: TeamFilters): Team[] {
  const needle = filters.q.trim().toLocaleLowerCase("it-IT");
  return teams.filter((team) => {
    if (filters.category && team.category !== filters.category) return false;
    if (filters.gender && team.gender !== filters.gender) return false;
    if (!needle) return true;
    return [team.name, team.category ?? ""].some((text) => text.toLocaleLowerCase("it-IT").includes(needle));
  });
}

const collator = new Intl.Collator("it-IT", { numeric: true, sensitivity: "base" });

/** Distinct categories in use, in natural order ("U9" before "U10"). */
export function categoryOptions(teams: readonly Team[]): string[] {
  const categories = new Set<string>();
  for (const team of teams) if (team.category) categories.add(team.category);
  return [...categories].sort(collator.compare);
}
