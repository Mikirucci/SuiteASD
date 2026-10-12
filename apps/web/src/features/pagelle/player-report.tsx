"use client";

import { ArrowLeft, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ProgressRing, formatGrade, gradeTone } from "@/components/ui/progress-ring";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMatchDate } from "@/features/classifiche/format";
import type { Season } from "@/features/classifiche/types";
import { describeError, useApiQuery } from "@/lib/api";
import { useAllPages } from "@/lib/use-all-pages";
import { MvpBadge } from "./mvp-badge";
import { STAT_LABELS, memberName } from "./rating";
import { TrendBars } from "./trend-bars";
import type { HistoryItem, MemberSummary } from "./types";

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-xl font-extrabold tracking-title tabular-nums text-fg">{children}</dd>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento della pagella" className="flex flex-col gap-4">
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-32" />
      <Skeleton className="h-40" />
    </div>
  );
}

export interface PlayerReportProps {
  memberId: string;
  /** Heading level of the player's name: h1 on its own page, h2 when embedded in the Pagelle page. */
  headingLevel: "h1" | "h2";
  /** Shows a link back to the Pagelle overview (staff). */
  showBackLink?: boolean;
}

/** One player over time: season average, trend, statistics totals and the list of report cards. */
export function PlayerReport({ memberId, headingLevel: Heading, showBackLink }: PlayerReportProps) {
  const [seasonId, setSeasonId] = useState("");
  const seasons = useAllPages<Season>(["seasons"], "/seasons");
  const summary = useApiQuery<MemberSummary>(
    ["member-summary", memberId, seasonId],
    `/members/${memberId}/evaluation-summary`,
    {
      query: { seasonId },
    },
  );
  const history = useAllPages<HistoryItem>(["member-history", memberId, seasonId], `/members/${memberId}/evaluations`, {
    seasonId,
  });

  if (summary.isLoading) return <PlayerSkeleton />;
  if (summary.error || !summary.data) {
    return <ErrorState message={describeError(summary.error)} onRetry={() => void summary.refetch()} />;
  }

  const { member, matchesRated, averageRating, bestRating, mvpCount, totals, trend } = summary.data;
  const name = memberName(member);
  const drafts = (history.data ?? []).filter((item) => !item.evaluation.published).length;

  return (
    <div className="flex flex-col gap-6">
      {showBackLink ? (
        <Link
          href="/pagelle"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm font-semibold text-primary-fg hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tutte le pagelle
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} size="xl" decorative />
        <div className="min-w-0 flex-1">
          <Heading className="text-xl font-extrabold tracking-title text-fg sm:text-2xl">{name}</Heading>
          {member.fieldRole ? <Badge className="mt-1">{member.fieldRole}</Badge> : null}
        </div>
        <Select
          className="w-full sm:w-56"
          label="Stagione"
          value={seasonId}
          onChange={(event) => setSeasonId(event.target.value)}
          placeholder="Tutte le stagioni"
          options={(seasons.data ?? []).map((season) => ({ value: season.id, label: season.name }))}
        />
      </div>

      {matchesRated === 0 ? (
        (history.data?.length ?? 0) > 0 ? (
          <Alert tone="info">Media e andamento compaiono con la prima pagella pubblicata. Le bozze non contano.</Alert>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Nessuna pagella pubblicata"
            description="Dopo ogni gara l'allenatore assegna un voto: qui trovi media, andamento e statistiche."
          />
        )
      ) : (
        <>
          <section aria-label="Riepilogo della stagione" className="flex flex-wrap items-center gap-6">
            <ProgressRing value={averageRating ?? 0} size={96} label={`Media voto di ${name}`} />
            <dl className="grid grid-cols-3 gap-6">
              <Stat label="Partite valutate">{matchesRated}</Stat>
              <Stat label="Voto migliore">{bestRating === null ? "-" : formatGrade(bestRating)}</Stat>
              <Stat label="Premi MVP">{mvpCount}</Stat>
            </dl>
          </section>
          <section aria-labelledby="trend-title" className="flex flex-col gap-3">
            <h2 id="trend-title" className="text-lg font-bold tracking-title text-fg">
              Andamento
            </h2>
            <TrendBars points={trend} />
          </section>
          <section aria-labelledby="totals-title" className="flex flex-col gap-3">
            <h2 id="totals-title" className="text-lg font-bold tracking-title text-fg">
              Statistiche in totale
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
              {STAT_LABELS.map(({ key, label }) => (
                <Stat key={key} label={label}>
                  {totals[key]}
                </Stat>
              ))}
            </dl>
          </section>
        </>
      )}

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-lg font-bold tracking-title text-fg">
          Partita per partita
        </h2>
        {drafts > 0 ? (
          <p className="text-sm text-fg-muted">
            Le pagelle in bozza non sono visibili alla giocatrice e non entrano nella media.
          </p>
        ) : null}
        <DataList
          label="Pagelle partita per partita"
          items={history.data}
          isLoading={history.isLoading}
          error={history.error}
          onRetry={() => void history.refetch()}
          loadingLabel="Caricamento delle pagelle"
          getKey={(item) => item.matchId}
          empty={<p className="text-sm text-fg-muted">Ancora nessuna pagella per questa selezione.</p>}
          renderItem={(item) => (
            <Link href={`/pagelle/partita/${item.matchId}`} className="block rounded-lg hover:bg-ink-50">
              <DataListRow
                title={item.label}
                subtitle={[
                  item.round ? `Giornata ${item.round}` : null,
                  item.playedAt ? formatMatchDate(item.playedAt) : null,
                  item.evaluation.notes,
                ]
                  .filter(Boolean)
                  .join(", ")}
                trailing={
                  <>
                    {item.evaluation.isMvp ? <MvpBadge /> : null}
                    {item.evaluation.published ? null : <Chip tone="warning">Bozza</Chip>}
                    <Chip tone={gradeTone(item.evaluation.rating)} className="min-w-12 justify-center text-sm">
                      <span className="sr-only">Voto </span>
                      {formatGrade(item.evaluation.rating)}
                    </Chip>
                  </>
                }
              />
            </Link>
          )}
        />
      </section>
    </div>
  );
}
