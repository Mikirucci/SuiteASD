"use client";

import { Select } from "@/components/ui/select";
import type { CompetitionScope } from "./use-competition-scope";

const KIND_LABEL = { LEAGUE: "Campionato", TOURNAMENT: "Torneo" } as const;

/** Three native selects: season, championship or tournament, group. Each one is hidden until its parent has options. */
export function ScopePicker({ scope }: { scope: CompetitionScope }) {
  const { seasons, competitions, groups, season, competition, group } = scope;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select
        label="Stagione"
        value={season?.id ?? ""}
        onChange={(event) => scope.selectSeason(event.target.value)}
        options={(seasons.data ?? []).map((item) => ({ value: item.id, label: item.isCurrent ? `${item.name} (in corso)` : item.name }))}
        disabled={!seasons.data || seasons.data.length === 0}
      />
      <Select
        label="Campionato o torneo"
        value={competition?.id ?? ""}
        onChange={(event) => scope.selectCompetition(event.target.value)}
        options={(competitions.data ?? []).map((item) => ({ value: item.id, label: `${item.name} (${KIND_LABEL[item.kind].toLowerCase()})` }))}
        disabled={!competitions.data || competitions.data.length === 0}
      />
      <Select
        label="Girone"
        value={group?.id ?? ""}
        onChange={(event) => scope.selectGroup(event.target.value)}
        options={(groups.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
        disabled={!groups.data || groups.data.length === 0}
      />
    </div>
  );
}
