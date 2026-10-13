"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Check, Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { PillFilter } from "@/components/ui/pill-filter";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAllPages } from "@/lib/use-all-pages";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatMatchDate, matchTitle, scoreOf } from "./format";
import { MatchDialog } from "./match-dialog";
import { ResultDialog } from "./result-dialog";
import type { Match, MatchStatus } from "./types";

const STATUS_CHIP: Record<MatchStatus, { label: string; tone: ChipTone; icon: ReactNode }> = {
  PLAYED: { label: "Giocata", tone: "success", icon: <Check strokeWidth={3} /> },
  SCHEDULED: { label: "In programma", tone: "brand", icon: <Clock /> },
  POSTPONED: { label: "Rinviata", tone: "warning", icon: <AlertTriangle /> },
  CANCELLED: { label: "Annullata", tone: "danger", icon: <X strokeWidth={3} /> },
};

interface RoundGroup {
  round: number | null;
  matches: Match[];
}

function groupByRound(matches: Match[]): RoundGroup[] {
  const byRound = new Map<number | null, Match[]>();
  for (const match of matches) byRound.set(match.round, [...(byRound.get(match.round) ?? []), match]);
  return [...byRound.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([round, items]) => ({ round, matches: items }));
}

const roundTitle = (round: number | null) => (round === null ? "Senza giornata" : `Giornata ${round}`);

interface MatchRowProps {
  match: Match;
  canWrite: boolean;
  onResult: (match: Match) => void;
  onEdit: (match: Match) => void;
  onDelete: (match: Match) => void;
}

function MatchRow({ match, canWrite, onResult, onEdit, onDelete }: MatchRowProps) {
  const chip = STATUS_CHIP[match.status];
  const score = scoreOf(match);
  const ours = match.homeTeam.isOurTeam || match.awayTeam.isOurTeam;
  const title = matchTitle(match);
  return (
    <li className={cn("rounded-lg bg-surface p-3 shadow-soft sm:p-4", ours && "ring-1 ring-inset ring-brand-200")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <Chip tone={chip.tone} icon={chip.icon}>
              {chip.label}
            </Chip>
            <span>{match.playedAt ? formatMatchDate(match.playedAt) : "Data da definire"}</span>
          </p>
          <p className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm text-fg">
            <span className={cn("truncate text-right", match.homeTeam.isOurTeam ? "font-extrabold" : "font-semibold")}>
              {match.homeTeam.name}
            </span>
            <span className="min-w-12 rounded-sm bg-ink-100 px-2 py-1 text-center text-base font-extrabold tabular-nums">
              {score ?? "-"}
              <span className="sr-only">{score ? "" : "ancora da giocare"}</span>
            </span>
            <span className={cn("truncate", match.awayTeam.isOurTeam ? "font-extrabold" : "font-semibold")}>
              {match.awayTeam.name}
            </span>
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-1">
            {match.status !== "CANCELLED" ? (
              <Button size="sm" variant="soft" onClick={() => onResult(match)}>
                {match.status === "PLAYED" ? "Correggi risultato" : "Inserisci risultato"}
              </Button>
            ) : null}
            <IconButton
              aria-label={`Modifica la partita ${title}`}
              icon={<Pencil />}
              onClick={() => onEdit(match)}
            />
            <IconButton
              aria-label={`Elimina la partita ${title}`}
              icon={<Trash2 />}
              onClick={() => onDelete(match)}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

export interface MatchesViewProps {
  competitionId: string;
  groupId: string;
  canWrite: boolean;
}

/** Rounds (giornate) and matches of a group; writers can add matches and enter, correct or remove results. */
export function MatchesView({ competitionId, groupId, canWrite }: MatchesViewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useAllPages<Match>(
    ["matches", competitionId, groupId],
    `/competitions/${competitionId}/groups/${groupId}/matches`,
  );
  const [roundFilter, setRoundFilter] = useState("all");
  const [resultMatch, setResultMatch] = useState<Match | null>(null);
  const [dialogMatch, setDialogMatch] = useState<{ match?: Match } | null>(null);
  const [deleting, setDeleting] = useState<Match | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = useApiMutation((id: string, client) => client.delete<undefined>(`/matches/${id}`), {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
      await queryClient.invalidateQueries({ queryKey: ["standings"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast({ title: "Partita eliminata", tone: "success" });
      setDeleting(null);
    },
  });

  const rounds = groupByRound(query.data ?? []);
  const visible = roundFilter === "all" ? rounds : rounds.filter((item) => String(item.round) === roundFilter);
  const addButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setDialogMatch({})}>
      Aggiungi partita
    </Button>
  ) : null;

  return (
    <section aria-labelledby="matches-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="matches-title" className="text-lg font-bold tracking-title text-fg">
          Giornate e partite
        </h2>
        {query.data && query.data.length > 0 ? addButton : null}
      </div>
      <DataBoundary
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!query.data || query.data.length === 0}
        loadingLabel="Caricamento delle partite"
        empty={
          <EmptyState
            icon={CalendarDays}
            title="Nessuna partita in questo girone"
            description={
              canWrite
                ? "Aggiungi la prima partita: appena inserisci un risultato la classifica si aggiorna."
                : "Le partite compariranno qui appena la segreteria le inserisce."
            }
            action={addButton}
          />
        }
      >
        {rounds.length > 1 ? (
          <PillFilter
            label="Filtra per giornata"
            value={roundFilter}
            onChange={setRoundFilter}
            options={[
              { value: "all", label: "Tutte" },
              ...rounds.map((item) => ({ value: String(item.round), label: item.round === null ? "Senza giornata" : `G${item.round}` })),
            ]}
          />
        ) : null}
        {visible.map((item) => (
          <div key={String(item.round)} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold uppercase tracking-label text-fg-muted">{roundTitle(item.round)}</h3>
            <ul aria-label={roundTitle(item.round)} className="flex flex-col gap-2">
              {item.matches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  canWrite={canWrite}
                  onResult={setResultMatch}
                  onEdit={(target) => setDialogMatch({ match: target })}
                  onDelete={(target) => {
                    setDeleteError(null);
                    setDeleting(target);
                  }}
                />
              ))}
            </ul>
          </div>
        ))}
      </DataBoundary>

      {canWrite ? (
        <>
          <ResultDialog match={resultMatch} onOpenChange={(open) => !open && setResultMatch(null)} />
          <MatchDialog
            key={dialogMatch?.match?.id ?? "new"}
            open={dialogMatch !== null}
            onOpenChange={(open) => !open && setDialogMatch(null)}
            competitionId={competitionId}
            groupId={groupId}
            match={dialogMatch?.match}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => !open && setDeleting(null)}
            title="Eliminare la partita?"
            description={deleting ? `${matchTitle(deleting)} sparisce dal girone e dalla classifica.` : ""}
            confirmLabel="Elimina partita"
            loading={remove.isPending}
            error={deleteError}
            onConfirm={() => {
              if (!deleting) return;
              setDeleteError(null);
              remove.mutate(deleting.id, { onError: (error) => setDeleteError(describeError(error)) });
            }}
          />
        </>
      ) : null}
    </section>
  );
}
