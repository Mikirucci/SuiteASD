"use client";

import type { ReactNode } from "react";
import { Alert, Button, Card, ProgressBar, Skeleton } from "@/components/ui";
import { formatEuro } from "@/features/quote/format";
import { describeError, type ApiError } from "@/lib/api";
import type { LedgerKind, LedgerReport } from "./types";

function Figure({ label, value, tone }: { label: string; value: ReactNode; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-fg";
  return (
    <div className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</dt>
      <dd className={`text-2xl font-extrabold tracking-title ${color}`}>{value}</dd>
    </div>
  );
}

interface CategoryListProps {
  title: string;
  kind: LedgerKind;
  report: LedgerReport;
}

function CategoryList({ title, kind, report }: CategoryListProps) {
  const rows = report.categories.filter((category) => category.kind === kind);
  const total = kind === "INCOME" ? report.totals.incomeCents : report.totals.expenseCents;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-fg">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Nessun movimento in questo anno.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.category} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-fg">{row.category}</span>
                <span className="shrink-0 font-semibold text-fg">{formatEuro(row.totalCents)}</span>
              </div>
              <ProgressBar
                label={`${title}: ${row.category}`}
                value={row.totalCents}
                max={total}
                tone={kind === "INCOME" ? "success" : "brand"}
                valueText={formatEuro(row.totalCents)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface LedgerSummaryProps {
  year: number;
  report: LedgerReport | undefined;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

function SummaryBody({ report, isLoading, error, onRetry }: Omit<LedgerSummaryProps, "year">) {
  if (isLoading) {
    return (
      <Card role="status" aria-busy="true" aria-label="Caricamento del riepilogo" className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Alert tone="danger" title="Riepilogo non disponibile">
        <p>{describeError(error)}</p>
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Riprova
        </Button>
      </Alert>
    );
  }

  const { totals } = report;
  return (
    <Card className="flex flex-col gap-6">
      <dl className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Figure label="Entrate" value={formatEuro(totals.incomeCents)} tone="success" />
        <Figure label="Uscite" value={formatEuro(totals.expenseCents)} />
        <Figure
          label="Saldo"
          value={`${totals.balanceCents < 0 ? "− " : ""}${formatEuro(Math.abs(totals.balanceCents))}`}
          tone={totals.balanceCents < 0 ? "danger" : undefined}
        />
      </dl>
      <div className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
        <CategoryList title="Entrate per categoria" kind="INCOME" report={report} />
        <CategoryList title="Uscite per categoria" kind="EXPENSE" report={report} />
      </div>
    </Card>
  );
}

/** Totals of the year and the breakdown by category, from GET /ledger/report. */
export function LedgerSummary({ year, ...state }: LedgerSummaryProps) {
  return (
    <section aria-labelledby="ledger-summary-title" className="flex flex-col gap-4">
      <h2 id="ledger-summary-title" className="text-lg font-bold tracking-title text-fg">
        Riepilogo {year}
      </h2>
      <SummaryBody {...state} />
    </section>
  );
}
