import { describe, expect, it } from "vitest";
import { team } from "@/features/tesserati/test-support";
import type { Team } from "@/features/tesserati/types";
import { EMPTY_TEAM_FILTERS, filterTeams, hasActiveFilters } from "./team-filters";

const U14: Team = { ...team("t14", "Under 14", "U14"), gender: "MALE" };
const U16: Team = { ...team("t16", "Under 16", "U16"), gender: "FEMALE" };
const U16_BIS: Team = { ...team("t16b", "Under 16 Blu", "U16"), gender: "FEMALE" };
const SERIE_D: Team = { ...team("td", "Serie D", "Serie D"), gender: "MIXED" };
const OPEN: Team = { ...team("to", "Open", null), gender: null };
const TEAMS = [U14, U16, U16_BIS, SERIE_D, OPEN];

describe("filterTeams", () => {
  it("returns every team when no filter is set", () => {
    expect(filterTeams(TEAMS, EMPTY_TEAM_FILTERS)).toEqual(TEAMS);
  });

  it("searches the name without caring about case or surrounding spaces", () => {
    expect(filterTeams(TEAMS, { ...EMPTY_TEAM_FILTERS, q: "  UNDER 16 " })).toEqual([U16, U16_BIS]);
  });

  it("looks at the name only, not at the category", () => {
    expect(filterTeams(TEAMS, { ...EMPTY_TEAM_FILTERS, q: "u14" })).toEqual([]);
    expect(filterTeams(TEAMS, { ...EMPTY_TEAM_FILTERS, q: "serie" })).toEqual([SERIE_D]);
  });

  it("keeps only the chosen gender", () => {
    expect(filterTeams(TEAMS, { ...EMPTY_TEAM_FILTERS, gender: "MIXED" })).toEqual([SERIE_D]);
  });

  it("combines search and gender", () => {
    expect(filterTeams(TEAMS, { q: "blu", gender: "FEMALE" })).toEqual([U16_BIS]);
    expect(filterTeams(TEAMS, { q: "blu", gender: "MALE" })).toEqual([]);
  });
});

describe("hasActiveFilters", () => {
  it("is false only when every filter is empty", () => {
    expect(hasActiveFilters(EMPTY_TEAM_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_TEAM_FILTERS, q: "x" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_TEAM_FILTERS, gender: "MALE" })).toBe(true);
  });
});
