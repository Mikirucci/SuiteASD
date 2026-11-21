"use client";

import { Building2, Clock, Coins, TrendingUp } from "lucide-react";
import { ErrorState, Skeleton, StatTile } from "@/components/ui";
import { describeError, useApiQuery } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { ResourceView } from "./crud/resource-view";
import { PageShell } from "./page-shell";
import { venuesConfig } from "./resources/venues";
import type { VenueSummary } from "./types";
import { formatDuration } from "./venue-slots";

function TilesSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento del riepilogo delle palestre" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-28 rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Palestre: where the club trains and plays, and what it costs. The totals first (how many, what is spent and on which
 * one, how many hours a week), then one card for each venue; a card opens it on the same page. The costs are
 * entries of the balance: here they are read at a glance, in Uscite together with all the others.
 */
export function VenuesPage() {
  const summary = useApiQuery<VenueSummary>(["venues", "summary"], "/venues/summary");
  const data = summary.data;

  return (
    <PageShell
      label="Palestre"
      title="Dove ci alleniamo e giochiamo."
      highlight="giochiamo."
      description="Indirizzi, capienza, orari e costo degli impianti: quanto si spende e per quale palestra."
    >
      <div className="flex flex-col gap-8">
        {summary.isLoading ? <TilesSkeleton /> : null}
        {summary.error ? <ErrorState title="Riepilogo non disponibile" message={describeError(summary.error)} onRetry={() => void summary.refetch()} /> : null}
        {data ? (
          <section aria-label="Riepilogo delle palestre" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Palestre"
              icon={Building2}
              value={data.count}
              note={data.capacityTotal > 0 ? `Capienza totale ${data.capacityTotal} persone` : "Nessuna capienza indicata"}
            />
            <StatTile
              label="Spesa"
              icon={Coins}
              tone="brand"
              value={formatEuro(data.costTotalCents)}
              note={
                data.costedCount === 0
                  ? "Nessun costo registrato"
                  : data.costThisMonthCents > 0
                    ? `${formatEuro(data.costThisMonthCents)} in questo mese`
                    : `${pluralize(data.costedCount, "palestra", "palestre")} con un costo`
              }
            />
            <StatTile
              label="Più costosa"
              icon={TrendingUp}
              value={data.priciest ? formatEuro(data.priciest.costCents) : "—"}
              note={data.priciest ? `${data.priciest.name} · il ${Math.round((data.priciest.costCents / data.costTotalCents) * 100)}% della spesa` : "Scrivi un costo per vederla"}
            />
            <StatTile
              label="Ore a settimana"
              icon={Clock}
              tone="success"
              value={formatDuration(data.weeklyMinutes)}
              note={data.slotsCount === 0 ? "Nessun orario fissato" : pluralize(data.slotsCount, "orario fissato", "orari fissati")}
            />
          </section>
        ) : null}
        <ResourceView config={venuesConfig} layout="grid" columns={2} />
      </div>
    </PageShell>
  );
}
