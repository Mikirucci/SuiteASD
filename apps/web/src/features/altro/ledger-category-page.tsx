"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui";
import { useApiQuery } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { ResourceView } from "./crud/resource-view";
import { CategorySourceNote, sourceOfCategory } from "./ledger-sources";
import { LedgerTiles } from "./ledger-tiles";
import { PeriodBar } from "./period-bar";
import { formatPeriod, rangeQuery } from "./period";
import { expensesConfig } from "./resources/expenses";
import { incomeConfig } from "./resources/income";
import type { LedgerKind, LedgerSummary } from "./types";
import { periodHref, usePeriod } from "./use-period";

/** Where the overview of each kind lives, how it is called and how its entries are counted. */
const KINDS = {
  EXPENSE: { path: "/altro/uscite", section: "Uscite", back: "Tutte le uscite", config: expensesConfig, count: (count: number) => pluralize(count, "spesa", "spese") },
  INCOME: { path: "/altro/entrate", section: "Entrate", back: "Tutte le entrate", config: incomeConfig, count: (count: number) => pluralize(count, "entrata", "entrate") },
} as const;

function decodeCategory(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export interface LedgerCategoryPageProps {
  kind: LedgerKind;
  category: string;
}

/** One category: its totals side by side and its entries as cards, with the search and the origin filter that only apply here. */
export function LedgerCategoryPage({ kind, category: segment }: LedgerCategoryPageProps) {
  const copy = KINDS[kind];
  const category = decodeCategory(segment);
  const period = usePeriod();
  const range = rangeQuery(period.range);
  const filters = { kind, category, ...range };
  const summary = useApiQuery<LedgerSummary>(["ledger", "summary", filters], "/ledger/summary", { query: filters });
  const count = summary.data?.count;
  const source = sourceOfCategory(category);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={periodHref(copy.path, period.range)}
        className="touch-target -ml-2 inline-flex w-fit items-center gap-2 rounded-md px-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {copy.back}
      </Link>
      <SectionHeading
        as="h1"
        label={copy.section}
        title={category}
        description={count === undefined ? formatPeriod(period.range) : `${copy.count(count)} · ${formatPeriod(period.range)}`}
      />
      <PeriodBar period={period} />
      {source ? <CategorySourceNote source={source} /> : null}
      {summary.data ? <LedgerTiles summary={summary.data} kind={kind} label="Rendiconto della categoria" last="average" /> : null}
      <ResourceView config={copy.config} layout="grid" columns={2} pageSize={12} extraQuery={filters} createPresets={{ category }} />
    </div>
  );
}
