"use client";

import { ArrowDown, ArrowUp, Check, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { useApiQuery } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describePointsRules, describeTiebreakers } from "./format";
import type { StandingRow, Standings } from "./types";

const ROW_GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)_3rem_2.5rem] items-center gap-2 sm:grid-cols-[2rem_minmax(0,1fr)_3rem_2.5rem_2.5rem_2.5rem_4.5rem] sm:gap-3";
const REORDER = { type: "spring", stiffness: 420, damping: 38 } as const;

/**
 * Positions gained or lost since the previous data. A refetch that changes nothing keeps the last movements visible,
 * so the "+1" next to the team that climbed does not vanish on the next background refresh.
 */
function useMovements(rows: StandingRow[] | undefined): Map<string, number> {
  const [state, setState] = useState<{ rows: StandingRow[] | undefined; moves: Map<string, number> }>({
    rows,
    moves: new Map(),
  });
  if (rows && state.rows !== rows) {
    const before = new Map((state.rows ?? []).map((row) => [row.groupTeamId, row.position]));
    const moves = new Map<string, number>();
    for (const row of rows) {
      const previous = before.get(row.groupTeamId);
      if (previous !== undefined && previous !== row.position) moves.set(row.groupTeamId, previous - row.position);
    }
    setState({ rows, moves: moves.size > 0 ? moves : state.moves });
  }
  return state.moves;
}

function Movement({ delta }: { delta: number }) {
  const up = delta > 0;
  const amount = Math.abs(delta);
  return (
    <Chip
      tone={up ? "success" : "neutral"}
      icon={up ? <ArrowUp strokeWidth={3} /> : <ArrowDown strokeWidth={3} />}
      className="px-2 py-0.5"
    >
      <span aria-hidden="true">{up ? `+${amount}` : `-${amount}`}</span>
      <span className="sr-only">
        {up ? "Sale di" : "Scende di"} {amount} {amount === 1 ? "posizione" : "posizioni"}
      </span>
    </Chip>
  );
}

function StandingsRow({ row, delta }: { row: StandingRow; delta: number | undefined }) {
  return (
    <motion.div
      role="row"
      layout="position"
      transition={REORDER}
      className={cn(
        ROW_GRID,
        "min-h-14 border-b border-line px-3 py-2 last:border-b-0 sm:px-4",
        row.isOurTeam && "bg-primary-soft",
      )}
    >
      <div role="cell" className="text-sm font-bold tabular-nums text-fg-muted">
        {row.position}
      </div>
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <Avatar name={row.name} size="md" decorative />
        <div className="min-w-0">
          <p className={cn("flex items-center gap-2 text-sm text-fg", row.isOurTeam ? "font-extrabold" : "font-bold")}>
            <span className="truncate">{row.name}</span>
            {row.isOurTeam ? <Badge variant="brand">Noi</Badge> : null}
            {delta ? <Movement delta={delta} /> : null}
          </p>
          <p className="text-xs text-fg-muted sm:hidden">
            {row.won} V, {row.lost} P, set {row.setsFor}-{row.setsAgainst}
          </p>
        </div>
      </div>
      <div role="cell" className="text-right text-base font-extrabold tabular-nums text-fg">
        {row.points}
      </div>
      <div role="cell" className="text-right text-sm tabular-nums text-fg-muted">
        {row.played}
      </div>
      <div role="cell" className="hidden text-right text-sm tabular-nums text-fg-muted sm:block">
        {row.won}
      </div>
      <div role="cell" className="hidden text-right text-sm tabular-nums text-fg-muted sm:block">
        {row.lost}
      </div>
      <div role="cell" className="hidden text-right text-sm tabular-nums text-fg-muted sm:block">
        {row.setsFor}-{row.setsAgainst}
      </div>
    </motion.div>
  );
}

function HeaderCell({ children, className, label }: { children: string; className?: string; label?: string }) {
  return (
    <div
      role="columnheader"
      aria-label={label}
      className={cn("text-xs font-bold uppercase tracking-label text-fg-muted", className)}
    >
      {children}
    </div>
  );
}

function StandingsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Caricamento della classifica"
      className="overflow-hidden rounded-lg bg-surface shadow-soft"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2 last:border-b-0">
          <div aria-hidden="true" className="size-6 animate-pulse-soft rounded-sm bg-ink-200" />
          <div aria-hidden="true" className="size-10 animate-pulse-soft rounded-full bg-ink-200" />
          <div aria-hidden="true" className="h-3.5 flex-1 animate-pulse-soft rounded-md bg-ink-200" />
          <div aria-hidden="true" className="h-5 w-8 animate-pulse-soft rounded-md bg-ink-200" />
        </div>
      ))}
    </div>
  );
}

export interface StandingsViewProps {
  competitionId: string;
  groupId: string;
}

/** Standings of one group. Rows keep a stable key (the participant id), so a new order slides them into place. */
export function StandingsView({ competitionId, groupId }: StandingsViewProps) {
  const query = useApiQuery<Standings>(
    ["standings", competitionId, groupId],
    `/competitions/${competitionId}/groups/${groupId}/standings`,
  );
  const standings = query.data;
  const movements = useMovements(standings?.rows);
  // Several groups can be on screen together (tournament pools): the heading id must be unique
  const titleId = useId();

  return (
    <DataBoundary
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      isEmpty={!standings || standings.rows.length === 0}
      skeleton={<StandingsSkeleton />}
      empty={
        <EmptyState
          icon={Trophy}
          title="Il girone non ha ancora squadre"
          description="Aggiungi le squadre dalla scheda Gestione: la classifica nasce da sola con i primi risultati."
        />
      }
    >
      {standings ? (
        <section aria-labelledby={titleId} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={titleId} className="text-lg font-bold tracking-title text-fg">
              Classifica {standings.groupName}
            </h2>
            <Chip tone="success" icon={<Check strokeWidth={3} />}>
              Classifica aggiornata in automatico
            </Chip>
          </div>
          <div
            role="table"
            aria-label={`Classifica ${standings.groupName}`}
            className="overflow-hidden rounded-lg bg-surface shadow-soft"
          >
            <div role="row" className={cn(ROW_GRID, "border-b border-line bg-ink-50 px-3 py-3 sm:px-4")}>
              <HeaderCell label="Pos, posizione">Pos</HeaderCell>
              <HeaderCell>Squadra</HeaderCell>
              <HeaderCell className="text-right" label="PT, punti">
                PT
              </HeaderCell>
              <HeaderCell className="text-right" label="G, giocate">
                G
              </HeaderCell>
              <HeaderCell className="hidden text-right sm:block" label="V, vinte">
                V
              </HeaderCell>
              <HeaderCell className="hidden text-right sm:block" label="P, perse">
                P
              </HeaderCell>
              <HeaderCell className="hidden text-right sm:block" label="Set, vinti e persi">
                Set
              </HeaderCell>
            </div>
            {standings.rows.map((row) => (
              <StandingsRow key={row.groupTeamId} row={row} delta={movements.get(row.groupTeamId)} />
            ))}
          </div>
          <p className="text-xs text-fg-muted">
            {standings.matchesPlayed} partite giocate su {standings.matchesTotal}. Punti (vincente a perdente):{" "}
            {describePointsRules(standings.pointsRules)}. A pari punti contano {describeTiebreakers(standings.tiebreakers)}.
          </p>
        </section>
      ) : null}
    </DataBoundary>
  );
}
