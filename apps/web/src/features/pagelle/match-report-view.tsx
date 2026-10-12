"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { ConfirmDialog } from "@/features/classifiche/confirm-dialog";
import { formatMatchDate, matchTitle, scoreOf } from "@/features/classifiche/format";
import type { Match } from "@/features/classifiche/types";
import { describeError, useApiMutation, useApiQuery } from "@/lib/api";
import { EvaluationDialog } from "./evaluation-dialog";
import { ReportCardItem } from "./report-card-item";
import { maximaOf } from "./stat-bars";
import type { PublishResult, ReportCardEntry, ReportCards } from "./types";

function ReportCardsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Caricamento delle pagelle"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-48 rounded-lg" />
      ))}
    </div>
  );
}

/** Report cards of one match: staff rate and publish, players read their own published card. */
export function MatchReportView({ matchId }: { matchId: string }) {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canWrite = me?.permissions.includes("evaluations:write") ?? false;
  const isStaff = me?.permissions.includes("evaluations:read") ?? false;

  const match = useApiQuery<Match>(["match", matchId], `/matches/${matchId}`);
  const cards = useApiQuery<ReportCards>(["report-cards", matchId], `/matches/${matchId}/report-cards`);
  const [editing, setEditing] = useState<ReportCardEntry | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const publish = useApiMutation(
    (_: void, client) => client.post<PublishResult>(`/matches/${matchId}/evaluations/publish`),
    {
      onSuccess: async (result) => {
        await Promise.all(
          ["report-cards", "member-summary", "member-history", "evaluation-summaries"].map((key) =>
            queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
        toast({
          title: result.publishedCount === 1 ? "Pagella pubblicata" : `${result.publishedCount} pagelle pubblicate`,
          description: "Atlete e genitori hanno ricevuto la notifica.",
          tone: "success",
        });
        setPublishing(false);
      },
    },
  );

  const entries = cards.data?.data ?? [];
  const drafts = entries.filter((entry) => entry.evaluation && !entry.evaluation.published).length;
  const maxima = maximaOf(entries.flatMap((entry) => (entry.stats ? [entry.stats] : [])));
  const matchData = match.data;
  const played = matchData?.status === "PLAYED";
  const title = matchData ? matchTitle(matchData) : (cards.data?.label ?? "Pagelle della partita");
  const score = matchData ? scoreOf(matchData) : null;
  const details = matchData
    ? [
        matchData.round ? `Giornata ${matchData.round}` : null,
        matchData.playedAt ? formatMatchDate(matchData.playedAt) : null,
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/pagelle"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm font-semibold text-primary-fg hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Tutte le pagelle
      </Link>
      <SectionHeading
        as="h1"
        index={6}
        label="Pagelle e statistiche"
        title={title}
        highlight={score ?? undefined}
        description={details}
      />

      {canWrite && played && drafts > 0 ? (
        <Alert tone="info" title={drafts === 1 ? "Una pagella è in bozza" : `${drafts} pagelle sono in bozza`}>
          <p>Le giocatrici non la vedono finché non la pubblichi.</p>
          <Button
            className="mt-3"
            size="sm"
            leftIcon={<Send />}
            onClick={() => {
              setPublishError(null);
              setPublishing(true);
            }}
          >
            {drafts === 1 ? "Pubblica la pagella" : `Pubblica ${drafts} pagelle`}
          </Button>
        </Alert>
      ) : null}
      {canWrite && matchData && !played ? (
        <Alert tone="info">
          Le pagelle si compilano dopo la gara: inserisci prima il risultato dalla pagina Classifiche.
        </Alert>
      ) : null}

      <DataBoundary
        isLoading={cards.isLoading}
        error={cards.error}
        onRetry={() => void cards.refetch()}
        isEmpty={entries.length === 0}
        skeleton={<ReportCardsSkeleton />}
        empty={
          <EmptyState
            icon={ClipboardList}
            title={isStaff ? "Nessuna giocatrice per questa partita" : "La pagella non è ancora pubblicata"}
            description={
              isStaff
                ? "Le pagelle si assegnano alle giocatrici della squadra che ha giocato: controlla la rosa in Tesserati."
                : "Quando l'allenatore la pubblica, qui trovi voto, note e statistiche e ricevi una notifica."
            }
          />
        }
      >
        <h2 className="sr-only">Giocatrici</h2>
        <ul aria-label="Pagelle della partita" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <ReportCardItem
              key={entry.member.id}
              entry={entry}
              maxima={maxima}
              showStatus={isStaff}
              onEdit={canWrite && played ? setEditing : undefined}
            />
          ))}
        </ul>
      </DataBoundary>

      {canWrite ? (
        <>
          <EvaluationDialog matchId={matchId} entry={editing} onOpenChange={(open) => !open && setEditing(null)} />
          <ConfirmDialog
            open={publishing}
            onOpenChange={setPublishing}
            tone="primary"
            title={drafts === 1 ? "Pubblicare la pagella?" : `Pubblicare ${drafts} pagelle?`}
            description="Giocatrici e genitori ricevono subito una notifica con il voto. Le pagelle già pubblicate non cambiano."
            confirmLabel="Pubblica"
            loading={publish.isPending}
            error={publishError}
            onConfirm={() => {
              setPublishError(null);
              publish.mutate(undefined, { onError: (error) => setPublishError(describeError(error)) });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
