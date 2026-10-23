"use client";

import { Coins, Hourglass } from "lucide-react";
import { Alert, Button, Skeleton, StatTile } from "@/components/ui";
import { describeError, useApiQuery } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import type { FeePlan, FeesSummary, PlanReportEntry } from "./types";

/** Plans listed in the little per-plan report: the others are one click away in the cards below. */
const PLANS_SHOWN = 4;

function PlanReportTile({ plans, report }: { plans: readonly FeePlan[]; report: readonly PlanReportEntry[] }) {
  const rows = plans
    .map((plan) => ({ plan, entry: report.find((entry) => entry.feePlanId === plan.id) }))
    .filter((row): row is { plan: FeePlan; entry: PlanReportEntry } => row.entry !== undefined);
  const shown = rows.slice(0, PLANS_SHOWN);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-4 shadow-soft sm:p-5">
      <h2 className="text-xs font-bold uppercase tracking-label text-fg-muted">Per piano</h2>
      {shown.length === 0 ? (
        <p className="text-sm text-fg-muted">Appena generi le quote di un piano compare qui il suo rendiconto.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {shown.map(({ plan, entry }) => (
            <li key={plan.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
              <span className="truncate text-sm font-bold text-fg">{plan.name}</span>
              <span className="text-xs text-fg-muted">
                Incassato <span className="font-semibold text-success">{formatEuro(entry.incassatoCents)}</span> · Da incassare{" "}
                <span className="font-semibold text-fg">{formatEuro(entry.daIncassareCents)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown.length ? (
        <p className="text-xs text-fg-muted">e altri {pluralize(rows.length - shown.length, "piano", "piani")}, qui sotto.</p>
      ) : null}
    </div>
  );
}

export interface FeesSummaryBarProps {
  plans: readonly FeePlan[];
  report: readonly PlanReportEntry[];
}

/** Report at the top of the module: what has been collected, what is still to collect, and the same for each plan. */
export function FeesSummaryBar({ plans, report }: FeesSummaryBarProps) {
  const summary = useApiQuery<FeesSummary>(["fees-summary"], "/fees/summary");

  if (summary.isLoading) {
    return (
      <div role="status" aria-busy="true" aria-label="Caricamento del riepilogo" className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  if (summary.error || !summary.data) {
    return (
      <Alert tone="danger" title="Riepilogo non disponibile">
        <p>{describeError(summary.error)}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void summary.refetch()}>
          Riprova
        </Button>
      </Alert>
    );
  }

  const data = summary.data;
  return (
    <section aria-label="Rendiconto" className="grid gap-4 md:grid-cols-3">
      <StatTile label="Incassato" tone="success" icon={Coins} value={formatEuro(data.incassatoCents)} />
      <StatTile label="Da incassare" icon={Hourglass} value={formatEuro(data.daIncassareCents)} />
      <PlanReportTile plans={plans} report={report} />
    </section>
  );
}
