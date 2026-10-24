"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/cn";
import { describeError, useApiQuery } from "@/lib/api";
import { CategoryCard } from "./category-card";
import { ResourceFormDialog, type ResourceDialogState } from "./crud/resource-form-dialog";
import { PageShell } from "./page-shell";
import { expensesConfig } from "./resources/expenses";
import { rangeQuery } from "./spese-period";
import { SpesePeriodBar } from "./spese-period-bar";
import { SpeseTiles } from "./spese-tiles";
import { SpendingChart } from "./spending-chart";
import type { LedgerEntry, LedgerSummary } from "./types";
import { periodHref, useSpesePeriod } from "./use-spese-period";

function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento delle spese" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Spese: the extra costs of the club, written once and counted in the balance, next to the ones other sections book.
 * Like the other overviews it has the totals, then one card per category; the single expenses are on the page of the
 * category. The period is chosen once, in the middle, and both pages follow it.
 */
export function SpesePage() {
  const canWrite = usePermission(expensesConfig.writePermission);
  const period = useSpesePeriod();
  const [hovered, setHovered] = useState<string | null>(null);
  const [form, setForm] = useState<ResourceDialogState<LedgerEntry> | null>(null);

  const filters = { kind: "EXPENSE", ...rangeQuery(period.range) };
  const summary = useApiQuery<LedgerSummary>(["ledger", "summary", filters], "/ledger/summary", { query: filters });
  const categoryHref = (category: string) => periodHref(`/altro/spese/${encodeURIComponent(category)}`, period.range);

  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setForm({ mode: "create" })}>
      {expensesConfig.copy.newLabel}
    </Button>
  ) : undefined;
  const data = summary.data;

  return (
    <PageShell
      label="Spese"
      title="Ogni spesa, al suo posto."
      highlight="al suo posto."
      description="Una categoria per volta: apri una card per vedere le singole spese del periodo che scegli qui."
    >
      <div className="flex flex-col gap-8">
        <SpesePeriodBar period={period} />

        {summary.isLoading ? <OverviewSkeleton /> : null}
        {summary.error ? <ErrorState title="Spese non disponibili" message={describeError(summary.error)} onRetry={() => void summary.refetch()} /> : null}
        {data ? (
          <>
            <SpeseTiles summary={data} label="Rendiconto delle spese" last="categories" />
            <div className={cn("grid items-start gap-8", data.categories.length > 0 && "lg:grid-cols-[19rem_1fr]")}>
              {data.categories.length > 0 ? (
                <SpendingChart categories={data.categories} totalCents={data.totalCents} hovered={hovered} onHover={setHovered} hrefOf={categoryHref} />
              ) : null}
              <section aria-labelledby="categories-heading" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="categories-heading" className="text-lg font-bold tracking-title text-fg">
                    Categorie
                  </h2>
                  {data.categories.length > 0 ? newButton : null}
                </div>
                {data.categories.length === 0 ? (
                  <EmptyState icon={expensesConfig.icon} title={expensesConfig.copy.emptyTitle} description={expensesConfig.copy.emptyDescription} action={newButton} />
                ) : (
                  <ul aria-label="Categorie" className="grid gap-4 sm:grid-cols-2">
                    {data.categories.map((group) => (
                      <CategoryCard key={group.category} group={group} href={categoryHref(group.category)} active={hovered === group.category} onHover={setHovered} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
      <ResourceFormDialog config={expensesConfig} state={form} onClose={() => setForm(null)} />
    </PageShell>
  );
}
