"use client";

import { CalendarClock, Coins, Handshake, UserPlus } from "lucide-react";
import { ErrorState, Skeleton, StatTile } from "@/components/ui";
import { describeError, useApiQuery } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { ResourceView } from "./crud/resource-view";
import { PageShell } from "./page-shell";
import { RelatedLink } from "./related-link";
import { EXPIRING_WITHIN_DAYS, sponsorsConfig } from "./resources/sponsors";
import type { SponsorSummary } from "./types";

function TilesSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento del riepilogo degli sponsor" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-28 rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Sponsor: who supports the club and for how much. The totals of the contracts first, then one card for each sponsor
 * with the search, the state filter and the new-sponsor button on a single row, like the other lists of the section.
 * The tiles follow the list: saving a sponsor reads them again.
 */
export function SponsorsPage() {
  const summary = useApiQuery<SponsorSummary>(["sponsors", "summary"], "/sponsors/summary");
  const data = summary.data;

  return (
    <PageShell
      label="Sponsor"
      title="Contratti e scadenze sotto controllo."
      highlight="sotto controllo."
      description="Importi, scadenze e referenti di chi sostiene la società."
      related={<RelatedLink href="/altro/entrate/Sponsor" label="Vedi le entrate degli sponsor" />}
    >
      <div className="flex flex-col gap-8">
        {summary.isLoading ? <TilesSkeleton /> : null}
        {summary.error ? <ErrorState title="Riepilogo non disponibile" message={describeError(summary.error)} onRetry={() => void summary.refetch()} /> : null}
        {data ? (
          <section aria-label="Riepilogo degli sponsor" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Attivi"
              icon={Handshake}
              tone="success"
              value={data.activeCount}
              note={data.expiredCount === 0 ? "Nessun contratto scaduto" : pluralize(data.expiredCount, "contratto scaduto", "contratti scaduti")}
            />
            <StatTile label="Valore" icon={Coins} tone="brand" value={formatEuro(data.activeCents)} note="dei contratti attivi" />
            <StatTile
              label="In scadenza"
              icon={CalendarClock}
              tone={data.expiringCount > 0 ? "warning" : "default"}
              value={data.expiringCount}
              note={`entro ${EXPIRING_WITHIN_DAYS} giorni`}
            />
            <StatTile label="Potenziali" icon={UserPlus} value={data.prospectCount} note="ancora da convincere" />
          </section>
        ) : null}
        <ResourceView config={sponsorsConfig} layout="grid" columns={2} />
      </div>
    </PageShell>
  );
}
