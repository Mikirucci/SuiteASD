import type { Team } from "@/features/tesserati/types";
import type { TeamGender } from "./team-schema";

export interface TeamFilters {
  q: string;
  gender: TeamGender | "";
}

export const EMPTY_TEAM_FILTERS: TeamFilters = { q: "", gender: "" };

export function hasActiveFilters(filters: TeamFilters): boolean {
  return filters.q.trim() !== "" || filters.gender !== "";
}

/** Search matches the name, ignoring case; the gender must match exactly. */
export function filterTeams(teams: readonly Team[], filters: TeamFilters): Team[] {
  const needle = filters.q.trim().toLocaleLowerCase("it-IT");
  return teams.filter((team) => {
    if (filters.gender && team.gender !== filters.gender) return false;
    return !needle || team.name.toLocaleLowerCase("it-IT").includes(needle);
  });
}
