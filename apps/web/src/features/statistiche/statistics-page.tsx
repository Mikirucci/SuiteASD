"use client";

import { BarChart3, CalendarDays, Lock, Trophy } from "lucide-react";
import { AutoChip, Chip } from "@/components/ui/chip";
import { Card } from "@/components/ui/card";
import { DataBoundary } from "@/components/ui/data-boundary";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMatchDate } from "@/features/classifiche/format";
import { formatEuro } from "@/lib/format";
import { usePermission } from "@/hooks/use-permission";
import { useApiQuery } from "@/lib/api";
import { CertificatesCard } from "./certificates-card";
import { Figure } from "./figure";
import { MembersByTeam } from "./members-by-team";
import type { EventType, StatisticsOverview } from "./types";

const EVENT_LABELS: Record<EventType, string> = {
  MATCH: "Partita",
  TRAINING: "Allenamento",
  TOURNAMENT: "Torneo",
  MEETING: "Riunione",
};

function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento delle statistiche" className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: StatisticsOverview }) {
  const { members, attendance, fees } = data;
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card as="section" aria-label="Tesserati e presenze" className="lg:col-span-2">
          <dl className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <Figure label="Tesserati attivi" value={members.total} />
            <Figure
              label="Presenza media"
              value={attendance.averagePercent === null ? "Nessun dato" : `${attendance.averagePercent}%`}
              note={
                attendance.averagePercent === null ? (
                  "Servono presenze registrate agli allenamenti."
                ) : (
                  <>
                    <span className="mb-2 block">
                      Allenamenti, ultimi 90 giorni ({attendance.recordsCount} presenze registrate)
                    </span>
                    <ProgressBar label="Presenza media agli allenamenti" value={attendance.averagePercent} tone="success" />
                  </>
                )
              }
            />
          </dl>
        </Card>
        <Card as="section" aria-label="Quote" className="lg:col-span-3">
          <dl className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Figure label="Incassato" tone="success" value={formatEuro(fees.collectedCents)} />
            <Figure
              label="Da incassare"
              value={formatEuro(fees.toCollectCents)}
              note={fees.overdueCents > 0 ? `di cui ${formatEuro(fees.overdueCents)} scaduti` : "nessuna quota scaduta"}
            />
            <Figure label="Promemoria inviati" value={fees.remindersSent} note={<AutoChip />} />
          </dl>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <MembersByTeam teams={members.byTeam} />
        <CertificatesCard counts={data.certificates} />
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <section aria-labelledby="upcoming-title" className="flex flex-col gap-3">
          <h2 id="upcoming-title" className="text-lg font-bold tracking-title text-fg">
            Prossimi eventi
          </h2>
          <DataList
            label="Prossimi eventi"
            items={data.upcomingEvents}
            getKey={(event) => event.id}
            empty={
              <EmptyState icon={CalendarDays} title="Nessun evento in programma" description="Gli eventi inseriti nel calendario compaiono qui." />
            }
            renderItem={(event) => (
              <DataListRow
                title={event.title}
                subtitle={[formatMatchDate(event.startsAt), event.teamName].filter(Boolean).join(" · ")}
                trailing={<Chip>{EVENT_LABELS[event.type]}</Chip>}
              />
            )}
          />
        </section>
        <section aria-labelledby="results-title" className="flex flex-col gap-3">
          <h2 id="results-title" className="text-lg font-bold tracking-title text-fg">
            Ultimi risultati
          </h2>
          <DataList
            label="Ultimi risultati"
            items={data.latestResults}
            getKey={(result) => result.matchId}
            empty={
              <EmptyState icon={Trophy} title="Nessun risultato ancora" description="I risultati inseriti nelle classifiche compaiono qui." />
            }
            renderItem={(result) => (
              <DataListRow
                title={`${result.homeTeam} - ${result.awayTeam}`}
                subtitle={[result.competitionName, result.playedAt ? formatMatchDate(result.playedAt) : null].filter(Boolean).join(" · ")}
                trailing={
                  <span className="text-base font-extrabold tabular-nums text-fg">
                    <span className="sr-only">Risultato </span>
                    {result.homeSets}-{result.awaySets}
                  </span>
                }
              />
            )}
          />
        </section>
      </div>
    </div>
  );
}

/** Society dashboard: the figures of the other modules in one page, read-only. */
export function StatisticsPage() {
  const canRead = usePermission("statistics:read");
  const overview = useApiQuery<StatisticsOverview>(["statistics-overview"], "/statistics/overview", { enabled: canRead });

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        label="Statistiche"
        title="La società in un colpo d'occhio."
        highlight="in un colpo d'occhio."
        description="Tesserati, certificati, quote e presenze di tutta la società, aggiornati a ogni apertura."
      />
      {canRead ? (
        <DataBoundary
          isLoading={overview.isLoading}
          error={overview.error}
          onRetry={() => void overview.refetch()}
          isEmpty={!overview.data}
          skeleton={<OverviewSkeleton />}
          empty={
            <EmptyState icon={BarChart3} title="Nessun dato da mostrare" description="Appena ci sono tesserati e quote, le statistiche compaiono qui." />
          }
        >
          {overview.data ? <Dashboard data={overview.data} /> : null}
        </DataBoundary>
      ) : (
        <EmptyState
          icon={Lock}
          title="Statistiche riservate"
          description="Le statistiche della società sono visibili a presidenza e segreteria."
        />
      )}
    </div>
  );
}
