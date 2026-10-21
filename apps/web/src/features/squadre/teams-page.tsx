"use client";

import { Plus, Search, SearchX, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, DataBoundary, EmptyState, Input, SectionHeading, Select } from "@/components/ui";
import type { Team } from "@/features/tesserati/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { useAllTeams, useWeekLoadByTeam } from "./api";
import { DeleteTeamDialog } from "./delete-team-dialog";
import { TeamCard } from "./team-card";
import { EMPTY_TEAM_FILTERS, filterTeams, hasActiveFilters, type TeamFilters } from "./team-filters";
import { TeamFormDialog } from "./team-form-dialog";
import { TEAM_GENDER_OPTIONS, type TeamGender } from "./team-schema";

/** Filters make sense once there is something to choose between. */
const MIN_TEAMS_FOR_FILTERS = 2;

function countLabel(shown: number, total: number): string {
  const teams = pluralize(total, "squadra", "squadre");
  return shown === total ? teams : `${shown} di ${teams}`;
}

/**
 * The teams of the society, on two levels: the title, then one row with search, gender and the new-team button, then
 * the cards, all of the same size and striped with the colour of the gender.
 */
export function TeamsPage() {
  const canWrite = usePermission("teams:write");
  const list = useAllTeams();
  const week = useWeekLoadByTeam();
  const [formOpen, setFormOpen] = useState(false);
  // Kept after the dialog closes so that its closing animation does not flash the "new team" form
  const [editing, setEditing] = useState<Team | undefined>(undefined);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [search, setSearch] = useState(EMPTY_TEAM_FILTERS.q);
  const [gender, setGender] = useState(EMPTY_TEAM_FILTERS.gender);
  const debouncedSearch = useDebouncedValue(search);

  // Emptying the box applies at once; typing waits for a pause so that the counter is not read at every key
  const filters: TeamFilters = { q: search === "" ? "" : debouncedSearch, gender };
  const teams = useMemo(() => list.data ?? [], [list.data]);
  const visible = filterTeams(teams, filters);
  const filtering = hasActiveFilters(filters);

  function openForm(team?: Team) {
    setEditing(team);
    setFormOpen(true);
  }

  function resetFilters() {
    setSearch(EMPTY_TEAM_FILTERS.q);
    setGender(EMPTY_TEAM_FILTERS.gender);
  }

  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => openForm()} className="shrink-0">
      Nuova squadra
    </Button>
  ) : undefined;

  const noTeams = (
    <EmptyState
      icon={UsersRound}
      title="Nessuna squadra ancora"
      description={
        canWrite
          ? "Crea la prima squadra: poi potrai assegnarle i tesserati e pianificare le partite."
          : "La segreteria non ha ancora creato le squadre."
      }
      action={newButton}
    />
  );
  const noResults = (
    <EmptyState
      icon={SearchX}
      title="Nessuna squadra trovata"
      description="Prova con un altro nome o cambia i filtri."
      action={
        <Button variant="secondary" onClick={resetFilters}>
          Azzera i filtri
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Squadre"
        title="Le squadre della società."
        highlight="squadre"
        description="Apri una squadra per vedere i tesserati, i prossimi appuntamenti e le quote. Per aggiungere i tesserati manda il link d'iscrizione: gli atleti entrano nella squadra giusta da soli."
      />

      {teams.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {teams.length >= MIN_TEAMS_FOR_FILTERS ? (
              <>
                <Input
                  label="Cerca squadra"
                  hideLabel
                  type="search"
                  placeholder="Cerca per nome"
                  leadingIcon={<Search />}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="sm:flex-1"
                />
                <Select
                  label="Genere"
                  hideLabel
                  placeholder="Tutti i generi"
                  options={TEAM_GENDER_OPTIONS}
                  value={gender}
                  onChange={(event) => setGender(event.target.value as TeamGender | "")}
                  className="sm:w-48"
                />
              </>
            ) : (
              <div className="sm:flex-1" />
            )}
            {newButton}
          </div>
          {/* Said to screen readers whenever the list changes, shown only when a filter narrows it */}
          <p aria-live="polite" className={cn("flex items-center gap-3 text-sm font-semibold text-fg-muted", !filtering && "sr-only")}>
            {countLabel(visible.length, teams.length)}
            {filtering && visible.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Azzera i filtri
              </Button>
            ) : null}
          </p>
        </div>
      ) : null}

      <DataBoundary
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        isEmpty={visible.length === 0}
        empty={teams.length === 0 ? noTeams : noResults}
        loadingLabel="Caricamento delle squadre"
        skeletonRows={4}
      >
        <ul aria-label="Squadre" className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((team) => (
            <li key={team.id}>
              <TeamCard
                team={team}
                week={week}
                onEdit={canWrite ? () => openForm(team) : undefined}
                onDelete={canWrite ? () => setDeleting(team) : undefined}
              />
            </li>
          ))}
        </ul>
      </DataBoundary>

      {canWrite ? (
        <>
          <TeamFormDialog open={formOpen} onOpenChange={setFormOpen} team={editing} />
          <DeleteTeamDialog team={deleting} onClose={() => setDeleting(null)} />
        </>
      ) : null}
    </div>
  );
}
