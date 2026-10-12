"use client";

import { ChevronRight, ClipboardList, Layers } from "lucide-react";
import Link from "next/link";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ScopePicker } from "@/features/classifiche/scope-picker";
import { formatMatchDate, matchTitle } from "@/features/classifiche/format";
import type { Match } from "@/features/classifiche/types";
import { useCompetitionScope } from "@/features/classifiche/use-competition-scope";
import { useAllPages } from "@/lib/use-all-pages";

/** Played matches of a group: the entry point to the report cards of each one. */
export function PlayedMatchesView() {
  const scope = useCompetitionScope();
  const { competition, group } = scope;
  const matches = useAllPages<Match>(
    ["matches", competition?.id, group?.id, "played"],
    competition && group ? `/competitions/${competition.id}/groups/${group.id}/matches` : null,
    { status: "PLAYED" },
  );
  const sorted = [...(matches.data ?? [])].sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? ""));
  const loadError = scope.seasons.error ?? scope.competitions.error ?? scope.groups.error;
  const noGroup = !scope.seasons.isLoading && !scope.competitions.isLoading && !scope.groups.isLoading && !group;

  return (
    <div className="flex flex-col gap-4">
      <ScopePicker scope={scope} />
      {noGroup && !loadError ? (
        <EmptyState
          icon={Layers}
          title="Nessun girone da mostrare"
          description="Le pagelle partono dalle partite giocate: crea stagione, campionato e girone dalla pagina Classifiche."
        />
      ) : (
        <DataList
          label="Partite giocate"
          items={sorted}
          isLoading={
            scope.seasons.isLoading || scope.competitions.isLoading || scope.groups.isLoading || matches.isLoading
          }
          error={loadError ?? matches.error}
          onRetry={() => {
            void scope.seasons.refetch();
            void scope.competitions.refetch();
            void scope.groups.refetch();
            void matches.refetch();
          }}
          loadingLabel="Caricamento delle partite giocate"
          getKey={(match) => match.id}
          empty={
            <EmptyState
              icon={ClipboardList}
              title="Nessuna partita giocata"
              description="Quando inserisci il risultato di una partita, qui compare la sua pagella da compilare."
            />
          }
          renderItem={(match) => (
            <Link href={`/pagelle/partita/${match.id}`} className="block rounded-lg hover:bg-ink-50">
              <DataListRow
                title={matchTitle(match)}
                subtitle={[
                  match.round ? `Giornata ${match.round}` : null,
                  match.playedAt ? formatMatchDate(match.playedAt) : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                trailing={<ChevronRight aria-hidden="true" className="size-5 text-fg-subtle" />}
              />
            </Link>
          )}
        />
      )}
    </div>
  );
}
