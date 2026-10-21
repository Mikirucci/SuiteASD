"use client";

import { BarChart3, Lock } from "lucide-react";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/hooks/use-permission";
import { useApiQuery } from "@/lib/api";
import { CertificatesSection } from "./certificates-section";
import { LatestResultsSection, UpcomingEventsSection } from "./events-and-results";
import { FeesSection } from "./fees-section";
import { KpiGrid } from "./kpi-grid";
import { MembersByTeam } from "./members-by-team";
import type { StatisticsOverview } from "./types";

/** Same grid as the loaded page: 12 columns from lg, one column below. */
const ROW = "grid gap-8 lg:grid-cols-12 lg:gap-x-6";

function SkeletonSection({ className, bodyClassName }: { className?: string; bodyClassName: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <Skeleton className={`mt-3 ${bodyClassName}`} />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento delle statistiche" className="flex flex-col gap-8">
      <Skeleton className="h-40 sm:h-32 lg:h-28" />
      <div className={ROW}>
        <SkeletonSection className="lg:col-span-7" bodyClassName="h-56" />
        <SkeletonSection className="lg:col-span-5" bodyClassName="h-56" />
      </div>
      <div className={`${ROW} lg:items-start`}>
        <SkeletonSection className="lg:col-span-7" bodyClassName="h-64" />
        <div className="flex flex-col gap-8 lg:col-span-5">
          <SkeletonSection bodyClassName="h-28" />
          <SkeletonSection bodyClassName="h-28" />
        </div>
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: StatisticsOverview }) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="headline-figures-title">
        <h2 id="headline-figures-title" className="sr-only">
          Numeri principali
        </h2>
        <KpiGrid data={data} />
      </section>
      <div className={ROW}>
        <FeesSection fees={data.fees} className="lg:col-span-7" />
        <CertificatesSection counts={data.certificates} className="lg:col-span-5" />
      </div>
      <div className={`${ROW} lg:items-start`}>
        <MembersByTeam teams={data.members.byTeam} className="lg:col-span-7" />
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-5">
          <UpcomingEventsSection events={data.upcomingEvents} />
          <LatestResultsSection results={data.latestResults} />
        </div>
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
