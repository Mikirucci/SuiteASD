"use client";

import { ArrowRight, FileText, HandCoins, Scale, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink, Card, ErrorState, ProgressBar, Skeleton, StatTile } from "@/components/ui";
import { describeError, useApiQuery } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { PageShell } from "./page-shell";
import { PeriodBar } from "./period-bar";
import { rangeQuery, type DayRange } from "./period";
import { ReportDialog } from "./report-dialog";
import { TrendChart } from "./trend-chart";
import type { LedgerKind, LedgerSummary, LedgerTrend } from "./types";
import { periodHref, usePeriod } from "./use-period";

/** The categories of one kind that are shown before "the others": enough to see where the money goes. */
const CATEGORIES_SHOWN = 6;

const COLUMN = {
  INCOME: { title: "Da dove arrivano i soldi", path: "/altro/entrate", open: "Apri le entrate", tone: "success" },
  EXPENSE: { title: "Dove vanno i soldi", path: "/altro/uscite", open: "Apri le uscite", tone: "brand" },
} as const;

function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento del bilancio" className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
      <div className="grid gap-8 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-56 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

interface BreakdownProps {
  kind: LedgerKind;
  summary: LedgerSummary;
  range: DayRange;
}

/** Where the money of one kind comes from or goes to: the biggest categories as bars, each one a way into its page. */
function Breakdown({ kind, summary, range }: BreakdownProps) {
  const column = COLUMN[kind];
  const shown = summary.categories.slice(0, CATEGORIES_SHOWN);
  const others = summary.categories.length - shown.length;
  const headingId = `breakdown-${kind.toLowerCase()}`;
  return (
    <Card as="section" aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg font-bold tracking-title text-fg">
          {column.title}
        </h2>
        <ButtonLink href={periodHref(column.path, range)} variant="ghost" size="sm">
          {column.open}
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-fg-muted">Nessun movimento in questo periodo.</p>
      ) : (
        <ul aria-label={column.title} className="flex flex-col gap-4">
          {shown.map((group) => (
            <li key={group.category} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={periodHref(`${column.path}/${encodeURIComponent(group.category)}`, range)}
                  className="min-w-0 break-words text-sm font-semibold text-fg underline-offset-2 hover:underline"
                >
                  {group.category}
                </Link>
                <span className="shrink-0 text-sm font-extrabold tabular-nums text-fg">
                  {kind === "INCOME" ? "+" : "−"} {formatEuro(group.totalCents)}
                </span>
              </div>
              <ProgressBar
                label={`${column.title}: ${group.category}`}
                value={group.totalCents}
                max={summary.totalCents}
                tone={column.tone}
                valueText={`${Math.round((group.totalCents / summary.totalCents) * 100)}% del totale`}
              />
            </li>
          ))}
        </ul>
      )}
      {others > 0 ? (
        <p className="text-sm text-fg-muted">
          Più {pluralize(others, "altra categoria", "altre categorie")}: le trovi tutte con &laquo;{column.open}&raquo;.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Bilancio: what is happening to the money of the club in the period. The totals first, then how incomes and expenses
 * follow one another, then where the money comes from and where it goes: every category leads to its movements, and
 * those lead to the section that produced them. It reads Entrate and Uscite; it has nothing of its own to write.
 */
export function BilancioPage() {
  const period = usePeriod();
  const [reportOpen, setReportOpen] = useState(false);

  const range = rangeQuery(period.range);
  const incomeFilters = { kind: "INCOME", ...range };
  const expenseFilters = { kind: "EXPENSE", ...range };
  const trend = useApiQuery<LedgerTrend>(["ledger", "trend", range], "/ledger/trend", { query: range });
  const income = useApiQuery<LedgerSummary>(["ledger", "summary", incomeFilters], "/ledger/summary", { query: incomeFilters });
  const expenses = useApiQuery<LedgerSummary>(["ledger", "summary", expenseFilters], "/ledger/summary", { query: expenseFilters });
  const error = trend.error ?? income.error ?? expenses.error;
  const loading = trend.isLoading || income.isLoading || expenses.isLoading;
  const ready = trend.data && income.data && expenses.data ? { trend: trend.data, income: income.data, expenses: expenses.data } : null;

  return (
    <PageShell
      label="Bilancio"
      title="Cosa succede ai soldi."
      highlight="ai soldi."
      description="Quanto è entrato, quanto è uscito e cosa resta nel periodo che scegli. Entrate e uscite si scrivono nelle loro sezioni: qui si leggono."
    >
      <div className="flex flex-col gap-8">
        <PeriodBar period={period} />

        {loading ? <OverviewSkeleton /> : null}
        {error ? (
          <ErrorState
            title="Bilancio non disponibile"
            message={describeError(error)}
            onRetry={() => {
              void trend.refetch();
              void income.refetch();
              void expenses.refetch();
            }}
          />
        ) : null}
        {ready ? (
          <>
            <section aria-label="Riepilogo del periodo" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Entrate" icon={TrendingUp} tone="success" value={formatEuro(ready.trend.totals.incomeCents)} note={pluralize(ready.income.count, "entrata", "entrate")} />
              <StatTile label="Uscite" icon={TrendingDown} tone="brand" value={formatEuro(ready.trend.totals.expenseCents)} note={pluralize(ready.expenses.count, "spesa", "spese")} />
              <StatTile
                label="Saldo"
                icon={Scale}
                tone={ready.trend.totals.balanceCents < 0 ? "danger" : "success"}
                value={`${ready.trend.totals.balanceCents < 0 ? "− " : ""}${formatEuro(Math.abs(ready.trend.totals.balanceCents))}`}
                note={ready.trend.totals.balanceCents < 0 ? "Hai speso più di quanto è entrato" : "Entrate meno uscite"}
              />
              <StatTile
                label="Da altre sezioni"
                icon={HandCoins}
                value={formatEuro(ready.income.linkedCents + ready.expenses.linkedCents)}
                note="nate da quote, sponsor e costi delle altre sezioni"
              />
            </section>

            <section aria-labelledby="trend-heading" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="trend-heading" className="text-lg font-bold tracking-title text-fg">
                  Andamento
                </h2>
                <Button variant="secondary" leftIcon={<FileText />} onClick={() => setReportOpen(true)}>
                  Report per il commercialista
                </Button>
              </div>
              <Card>
                <TrendChart trend={ready.trend} />
              </Card>
            </section>

            <div className="grid items-start gap-8 lg:grid-cols-2">
              <Breakdown kind="INCOME" summary={ready.income} range={period.range} />
              <Breakdown kind="EXPENSE" summary={ready.expenses} range={period.range} />
            </div>
          </>
        ) : null}
      </div>
      <ReportDialog range={period.range} open={reportOpen} onOpenChange={setReportOpen} />
    </PageShell>
  );
}
