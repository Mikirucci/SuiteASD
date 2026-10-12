"use client";

import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { gradeTone, formatGrade } from "@/components/ui/progress-ring";
import { Select } from "@/components/ui/select";
import type { OwnTeam, Season } from "@/features/classifiche/types";
import { useAllPages } from "@/lib/use-all-pages";
import { MvpBadge } from "./mvp-badge";
import { memberName } from "./rating";
import type { MemberSummary } from "./types";

/** Best average first; players without published ratings are not listed by the API. */
function byAverageDesc(a: MemberSummary, b: MemberSummary): number {
  return (
    (b.averageRating ?? 0) - (a.averageRating ?? 0) || memberName(a.member).localeCompare(memberName(b.member), "it-IT")
  );
}

/** Season comparison of the players: average rating, MVP awards, one row per player. */
export function PlayersOverview() {
  const [seasonId, setSeasonId] = useState("");
  const [teamId, setTeamId] = useState("");
  const seasons = useAllPages<Season>(["seasons"], "/seasons");
  const teams = useAllPages<OwnTeam>(["teams", "all"], "/teams");
  const summaries = useAllPages<MemberSummary>(
    ["evaluation-summaries", { seasonId, teamId }],
    "/evaluation-summaries",
    { seasonId, teamId },
  );
  const sorted = [...(summaries.data ?? [])].sort(byAverageDesc);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Stagione"
          value={seasonId}
          onChange={(event) => setSeasonId(event.target.value)}
          placeholder="Tutte le stagioni"
          options={(seasons.data ?? []).map((season) => ({ value: season.id, label: season.name }))}
        />
        <Select
          label="Squadra"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          placeholder="Tutte le squadre"
          options={(teams.data ?? []).map((team) => ({ value: team.id, label: team.name }))}
        />
      </div>
      <DataList
        label="Giocatrici con pagelle pubblicate"
        items={sorted}
        isLoading={summaries.isLoading}
        error={summaries.error}
        onRetry={() => void summaries.refetch()}
        loadingLabel="Caricamento delle giocatrici"
        getKey={(summary) => summary.member.id}
        empty={
          <EmptyState
            icon={Users}
            title="Nessuna pagella pubblicata"
            description="Il confronto compare quando almeno una pagella è pubblicata per la stagione e la squadra scelte."
          />
        }
        renderItem={(summary) => {
          const name = memberName(summary.member);
          return (
            <Link href={`/pagelle/giocatrice/${summary.member.id}`} className="block rounded-lg hover:bg-ink-50">
              <DataListRow
                leading={<Avatar name={name} decorative />}
                title={name}
                subtitle={`${summary.member.fieldRole ?? "Ruolo non indicato"}, ${summary.matchesRated} ${
                  summary.matchesRated === 1 ? "partita valutata" : "partite valutate"
                }`}
                trailing={
                  <>
                    {summary.mvpCount > 0 ? <MvpBadge /> : null}
                    {summary.averageRating === null ? null : (
                      <Chip tone={gradeTone(summary.averageRating)} className="min-w-12 justify-center text-sm">
                        <span className="sr-only">Media </span>
                        {formatGrade(summary.averageRating)}
                      </Chip>
                    )}
                    <ChevronRight aria-hidden="true" className="size-5 text-fg-subtle" />
                  </>
                }
              />
            </Link>
          );
        }}
      />
    </div>
  );
}
