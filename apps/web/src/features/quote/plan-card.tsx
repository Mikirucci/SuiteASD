import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, ProgressBar, Skeleton } from "@/components/ui";
import { formatEuro } from "@/lib/format";
import { describePlan } from "./format";
import { PlanCounters } from "./plan-counters";
import type { FeePlan, PlanStats, TeamRef } from "./types";

/** What the card can say about the people of its plan: the figures, or why it cannot (still loading, failed, no fees yet). */
export type PlanCardStats = PlanStats | { state: "loading" | "error" | "empty" };

export interface PlanCardProps {
  plan: FeePlan;
  teams: readonly TeamRef[];
  stats: PlanCardStats;
}

function Collected({ plan, stats }: { plan: FeePlan; stats: PlanCardStats }) {
  if ("state" in stats) {
    if (stats.state === "loading") return <Skeleton aria-hidden="true" className="h-8 w-full" />;
    return <p className="text-sm text-fg-muted">{stats.state === "error" ? "Anteprima non disponibile" : "Nessuna quota in questo piano"}</p>;
  }
  const total = stats.incassatoCents + stats.daIncassareCents;
  const summary = `${formatEuro(stats.incassatoCents)} su ${formatEuro(total)}`;
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar
        label={`Incassato del piano ${plan.name}`}
        value={stats.incassatoCents}
        max={Math.max(total, 1)}
        tone="success"
        valueText={summary}
      />
      <p className="text-sm text-fg-muted">
        <span className="font-bold text-fg">{formatEuro(stats.incassatoCents)}</span> su {formatEuro(total)}
      </p>
    </div>
  );
}

/**
 * One plan of the society, as a wide row: its name and terms, how much of it has been collected, and the three
 * previews of how its people are doing. The row stays readable with many plans in the list, and the whole of it opens the plan.
 */
export function PlanCard({ plan, teams, stats }: PlanCardProps) {
  return (
    <li className="relative grid gap-4 rounded-lg bg-surface p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft focus-within:ring-2 focus-within:ring-primary hover:-translate-y-0.5 hover:shadow-raised sm:p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_17rem] lg:items-center lg:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="min-w-0 text-base font-bold tracking-title text-fg">
            <Link href={`/quote/${plan.id}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
              {plan.name}
            </Link>
          </h3>
          {plan.isActive ? null : <Badge variant="neutral">Non attivo</Badge>}
        </div>
        <p className="text-sm text-fg-muted">{describePlan(plan, teams, 3)}</p>
      </div>
      <Collected plan={plan} stats={stats} />
      <div className="flex items-center justify-between gap-4 lg:justify-end">
        {"state" in stats ? null : <PlanCounters stats={stats} />}
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
      </div>
    </li>
  );
}
