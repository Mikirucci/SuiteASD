"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui";
import { useApiQuery } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { ResourceView } from "./crud/resource-view";
import { expensesConfig } from "./resources/expenses";
import { formatPeriod, rangeQuery } from "./spese-period";
import { SpesePeriodBar } from "./spese-period-bar";
import { SpeseTiles } from "./spese-tiles";
import type { LedgerSummary } from "./types";
import { periodHref, useSpesePeriod } from "./use-spese-period";

function decodeCategory(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** One category: its totals side by side and its expenses as cards, with the search and the origin filter that only apply here. */
export function SpeseCategoryPage({ category: segment }: { category: string }) {
  const category = decodeCategory(segment);
  const period = useSpesePeriod();
  const range = rangeQuery(period.range);
  const filters = { kind: "EXPENSE", category, ...range };
  const summary = useApiQuery<LedgerSummary>(["ledger", "summary", filters], "/ledger/summary", { query: filters });
  const count = summary.data?.count;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={periodHref("/altro/spese", period.range)}
        className="touch-target -ml-2 inline-flex w-fit items-center gap-2 rounded-md px-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Tutte le spese
      </Link>
      <SectionHeading
        as="h1"
        label="Spese"
        title={category}
        description={count === undefined ? formatPeriod(period.range) : `${pluralize(count, "spesa", "spese")} · ${formatPeriod(period.range)}`}
      />
      <SpesePeriodBar period={period} />
      {summary.data ? <SpeseTiles summary={summary.data} label="Rendiconto della categoria" last="average" /> : null}
      <ResourceView config={expensesConfig} layout="grid" columns={2} pageSize={12} extraQuery={{ kind: "EXPENSE", category, ...range }} createPresets={{ category }} />
    </div>
  );
}
