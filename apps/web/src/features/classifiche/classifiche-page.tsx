"use client";

import { Layers } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { describeError } from "@/lib/api";
import { ManageView } from "./manage-view";
import { MatchesView } from "./matches-view";
import { ScopePicker } from "./scope-picker";
import { StandingsView } from "./standings-view";
import { useCompetitionScope } from "./use-competition-scope";

const TRIGGER_CLASS = "h-11";

export function ClassifichePage() {
  const { me } = useAuth();
  const canWrite = me?.permissions.includes("competitions:write") ?? false;
  const scope = useCompetitionScope();
  const [tab, setTab] = useState("classifica");
  const { seasons, competitions, groups, competition, group } = scope;

  const loadError = seasons.error ?? competitions.error ?? groups.error;
  const loading = seasons.isLoading || (Boolean(scope.season) && competitions.isLoading) || (Boolean(competition) && groups.isLoading);

  const emptyTitle = !scope.season
    ? "Nessuna stagione"
    : !competition
      ? "Nessun campionato in questa stagione"
      : "Nessun girone in questo campionato";
  const noGroup = (
    <EmptyState
      icon={Layers}
      title={emptyTitle}
      description={
        canWrite
          ? "Crea stagione, campionato e girone dalla scheda Gestione."
          : "Appena la segreteria inserisce campionato e gironi, la classifica compare qui."
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        index={5}
        label="Gironi e classifiche"
        title="Classifiche che si aggiornano da sole."
        highlight="da sole."
        description="Inserisci il risultato di una partita: punti, posizioni e quozienti si ricalcolano subito."
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
            <div role="status" aria-busy="true" aria-label="Caricamento di stagioni e gironi" className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-18" />
              <Skeleton className="h-18" />
              <Skeleton className="h-18" />
            </div>
          ) : (
            <ScopePicker scope={scope} />
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Sezioni">
              <TabsTrigger className={TRIGGER_CLASS} value="classifica">
                Classifica
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
            {/* Standings stay mounted, so the positions gained after a result are still tracked while another tab is open */}
            <TabsContent value="classifica" forceMount>
              {competition && group ? (
                <StandingsView key={group.id} competitionId={competition.id} groupId={group.id} />
              ) : loading ? null : (
                noGroup
              )}
            </TabsContent>
            <TabsContent value="partite">
              {competition && group ? (
                <MatchesView key={group.id} competitionId={competition.id} groupId={group.id} canWrite={canWrite} />
              ) : loading ? null : (
                noGroup
              )}
            </TabsContent>
            {canWrite ? (
              <TabsContent value="gestione">
                <ManageView scope={scope} />
              </TabsContent>
            ) : null}
          </Tabs>
        </>
      )}
    </div>
  );
}
