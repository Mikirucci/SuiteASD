"use client";

import { Layers } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManageView } from "@/features/classifiche/manage-view";
import { MatchesView } from "@/features/classifiche/matches-view";
import { ScopePicker } from "@/features/classifiche/scope-picker";
import { StandingsView } from "@/features/classifiche/standings-view";
import { useCompetitionScope } from "@/features/classifiche/use-competition-scope";
import { usePermission } from "@/hooks/use-permission";
import { describeError } from "@/lib/api";

const TRIGGER_CLASS = "h-11";

/** Tournaments (competitions of kind TOURNAMENT): every pool has its own standings, derived from the results. */
export function TorneiPage() {
  const canWrite = usePermission("competitions:write");
  const scope = useCompetitionScope({ kind: "TOURNAMENT" });
  const [tab, setTab] = useState("classifiche");
  const { seasons, competitions, groups, season, competition, group } = scope;

  const loadError = seasons.error ?? competitions.error ?? groups.error;
  const loading = seasons.isLoading || (Boolean(season) && competitions.isLoading) || (Boolean(competition) && groups.isLoading);

  const emptyTitle = !season
    ? "Nessuna stagione"
    : !competition
      ? "Nessun torneo in questa stagione"
      : "Nessun girone in questo torneo";
  const noPool = (
    <EmptyState
      icon={Layers}
      title={emptyTitle}
      description={
        canWrite
          ? "Crea stagione, torneo e gironi dalla scheda Gestione."
          : "Appena la segreteria inserisce torneo e gironi, le classifiche compaiono qui."
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Tornei"
        title="Ogni girone ha la sua classifica."
        highlight="la sua classifica."
        description="Gironi, partite e risultati del torneo: le classifiche si ricalcolano a ogni risultato inserito."
      />

      {loadError ? (
        <ErrorState
          message={describeError(loadError)}
          onRetry={() => {
            void seasons.refetch();
            void competitions.refetch();
            void groups.refetch();
          }}
        />
      ) : (
        <>
          {loading ? (
            <div role="status" aria-busy="true" aria-label="Caricamento dei tornei" className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-18" />
              <Skeleton className="h-18" />
              <Skeleton className="h-18" />
            </div>
          ) : (
            <ScopePicker scope={scope} />
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Sezioni del torneo">
              <TabsTrigger className={TRIGGER_CLASS} value="classifiche">
                Classifiche
              </TabsTrigger>
              <TabsTrigger className={TRIGGER_CLASS} value="partite">
                Partite
              </TabsTrigger>
              {canWrite ? (
                <TabsTrigger className={TRIGGER_CLASS} value="gestione">
                  Gestione
                </TabsTrigger>
              ) : null}
            </TabsList>
            <TabsContent value="classifiche" forceMount>
              {competition && groups.data && groups.data.length > 0 ? (
                <div className="flex flex-col gap-8">
                  {groups.data.map((pool) => (
                    <StandingsView key={pool.id} competitionId={competition.id} groupId={pool.id} />
                  ))}
                </div>
              ) : loading ? null : (
                noPool
              )}
            </TabsContent>
            <TabsContent value="partite">
              {competition && group ? (
                <MatchesView key={group.id} competitionId={competition.id} groupId={group.id} canWrite={canWrite} />
              ) : loading ? null : (
                noPool
              )}
            </TabsContent>
            {canWrite ? (
              <TabsContent value="gestione">
                <ManageView scope={scope} kind="TOURNAMENT" />
              </TabsContent>
            ) : null}
          </Tabs>
        </>
      )}
    </div>
  );
}
