"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiError } from "@/lib/api";
import { useAllPages } from "@/lib/use-all-pages";
import type { Competition, CompetitionKind, Group, Season } from "./types";

interface Selection {
  seasonId: string | null;
  competitionId: string | null;
  groupId: string | null;
}

export interface CompetitionScope {
  seasons: UseQueryResult<Season[], ApiError>;
  competitions: UseQueryResult<Competition[], ApiError>;
  groups: UseQueryResult<Group[], ApiError>;
  season: Season | null;
  competition: Competition | null;
  group: Group | null;
  selectSeason: (id: string) => void;
  selectCompetition: (id: string) => void;
  selectGroup: (id: string) => void;
}

function pick<T extends { id: string }>(items: T[] | undefined, chosenId: string | null, fallback?: (items: T[]) => T | undefined): T | null {
  if (!items || items.length === 0) return null;
  return items.find((item) => item.id === chosenId) ?? fallback?.(items) ?? items[0] ?? null;
}

/**
 * Season -> competition -> group selection shared by standings and report cards.
 * Defaults: the current season, then the first competition and the first group. A change of season or
 * competition drops the choices below it, so the selection can never point at another parent's child.
 * With `kind`, only competitions of that kind are offered (the tournaments page).
 */
export function useCompetitionScope({ kind }: { kind?: CompetitionKind } = {}): CompetitionScope {
  const [selection, setSelection] = useState<Selection>({ seasonId: null, competitionId: null, groupId: null });

  const seasons = useAllPages<Season>(["seasons"], "/seasons");
  const season = pick(seasons.data, selection.seasonId, (items) => items.find((item) => item.isCurrent));

  const competitions = useAllPages<Competition>(
    ["competitions", { seasonId: season?.id, kind }],
    season ? "/competitions" : null,
    { seasonId: season?.id, kind },
  );
  const competition = pick(competitions.data, selection.competitionId);

  const groups = useAllPages<Group>(
    ["groups", { competitionId: competition?.id }],
    competition ? `/competitions/${competition.id}/groups` : null,
  );
  const group = pick(groups.data, selection.groupId);

  return {
    seasons,
    competitions,
    groups,
    season,
    competition,
    group,
    selectSeason: (id) => setSelection({ seasonId: id, competitionId: null, groupId: null }),
    selectCompetition: (id) => setSelection((current) => ({ ...current, competitionId: id, groupId: null })),
    selectGroup: (id) => setSelection((current) => ({ ...current, groupId: id })),
  };
}
