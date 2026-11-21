"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { usePermission } from "@/hooks/use-permission";
import { describeError, useApiQuery } from "@/lib/api";
import { CategoryCard } from "./category-card";
import { ResourceFormDialog, type ResourceDialogState } from "./crud/resource-form-dialog";
import { LedgerTiles } from "./ledger-tiles";
import { SOURCES, SOURCES_OF_KIND } from "./ledger-sources";
import { PageShell } from "./page-shell";
import { rangeQuery } from "./period";
import { PeriodBar } from "./period-bar";
import { expensesConfig } from "./resources/expenses";
import { incomeConfig } from "./resources/income";
import type { LedgerEntry, LedgerKind, LedgerSummary } from "./types";
import { periodHref, usePeriod } from "./use-period";

const COPY = {
  INCOME: {
    label: "Entrate",
    title: "Da dove arrivano i soldi.",
    highlight: "arrivano i soldi.",
    description: "Una categoria per volta: quote, sponsor e tutto ciò che entra. Apri una card per vedere le voci che hanno prodotto quell'entrata.",
    path: "/altro/entrate",
    config: incomeConfig,
    loading: "Caricamento delle entrate",
    errorTitle: "Entrate non disponibili",
    tilesLabel: "Rendiconto delle entrate",
    sourcesTitle: "Da dove nascono",
    sourcesText: "Le quote e gli sponsor entrano da soli: quando un pagamento viene registrato e quando un contratto è firmato. Le altre entrate le scrivi qui.",
  },
  EXPENSE: {
    label: "Uscite",
    title: "Dove vanno i soldi.",
    highlight: "vanno i soldi.",
    description: "Una categoria per volta: palestre, divise, trasferte, arbitri e le altre spese. Apri una card per vedere le voci che hanno prodotto quell'uscita.",
    path: "/altro/uscite",
    config: expensesConfig,
    loading: "Caricamento delle uscite",
    errorTitle: "Uscite non disponibili",
    tilesLabel: "Rendiconto delle uscite",
    sourcesTitle: "Da dove nascono",
    sourcesText: "I costi di palestre, divise, trasferte e arbitri escono da soli: appena li scrivi nella loro sezione. Le altre spese le registri qui.",
  },
} as const;

function OverviewSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Entrate or Uscite: the money that came in or went out in the period, one card for each category. A card opens the
 * category, where the entries that produced it are (a sponsor, a fee, a venue...). Under the totals, the sections that
 * feed this page by themselves are one click away: the money does not have to be written twice.
 */
export function LedgerOverviewPage({ kind }: { kind: LedgerKind }) {
  const copy = COPY[kind];
  const canWrite = usePermission(copy.config.writePermission);
  const period = usePeriod();
  const [form, setForm] = useState<ResourceDialogState<LedgerEntry> | null>(null);

  const filters = { kind, ...rangeQuery(period.range) };
  const summary = useApiQuery<LedgerSummary>(["ledger", "summary", filters], "/ledger/summary", { query: filters });
  const categoryHref = (category: string) => periodHref(`${copy.path}/${encodeURIComponent(category)}`, period.range);

  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setForm({ mode: "create" })}>
      {copy.config.copy.newLabel}
    </Button>
  ) : undefined;
  const data = summary.data;

  return (
    <PageShell label={copy.label} title={copy.title} highlight={copy.highlight} description={copy.description}>
      <div className="flex flex-col gap-8">
        <PeriodBar period={period} />

        {summary.isLoading ? <OverviewSkeleton label={copy.loading} /> : null}
        {summary.error ? <ErrorState title={copy.errorTitle} message={describeError(summary.error)} onRetry={() => void summary.refetch()} /> : null}
        {data ? (
          <>
            <LedgerTiles summary={data} kind={kind} label={copy.tilesLabel} last="categories" />

            <section aria-labelledby="sources-heading" className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-soft sm:p-5">
              <h2 id="sources-heading" className="text-base font-bold tracking-title text-fg">
                {copy.sourcesTitle}
              </h2>
              <p className="max-w-prose text-sm text-fg-muted">{copy.sourcesText}</p>
              <ul aria-label="Sezioni collegate" className="flex flex-wrap gap-2">
                {SOURCES_OF_KIND[kind].map((source) => (
                  <li key={source}>
                    <ButtonLink href={SOURCES[source].href} variant="secondary" size="sm">
                      {SOURCES[source].section}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="categories-heading" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="categories-heading" className="text-lg font-bold tracking-title text-fg">
                  Categorie
                </h2>
                {data.categories.length > 0 ? newButton : null}
              </div>
              {data.categories.length === 0 ? (
                <EmptyState icon={copy.config.icon} title={copy.config.copy.emptyTitle} description={copy.config.copy.emptyDescription} action={newButton} />
              ) : (
                <ul aria-label="Categorie" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {data.categories.map((group) => (
                    <CategoryCard key={group.category} group={group} href={categoryHref(group.category)} kind={kind} />
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
      <ResourceFormDialog config={copy.config} state={form} onClose={() => setForm(null)} />
    </PageShell>
  );
}
