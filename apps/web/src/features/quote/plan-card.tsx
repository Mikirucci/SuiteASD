import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, Skeleton } from "@/components/ui";
import { formatEuro } from "@/lib/format";
import { KIND_LABELS } from "./format";
import { PlanCounters } from "./plan-counters";
import type { FeePlan, PlanStats } from "./types";

export function describePlan(plan: FeePlan, teamName: string): string {
  const parts = [formatEuro(plan.amountCents), KIND_LABELS[plan.kind], teamName];
  if (plan.installments !== null) parts.push(`${plan.installments} rate`);
  if (plan.dueDay !== null) parts.push(`scade il ${plan.dueDay} del mese`);
  return parts.join(" · ");
}

/** What the card can say about the people of its plan: the figures, or why it cannot (still loading, failed, no fees yet). */
export type PlanCardStats = PlanStats | { state: "loading" | "error" | "empty" };

export interface PlanCardProps {
  plan: FeePlan;
  teamName: string;
  stats: PlanCardStats;
}

function Previews({ stats }: { stats: PlanCardStats }) {
  if (!("state" in stats)) return <PlanCounters stats={stats} />;
  if (stats.state === "loading") return <Skeleton aria-hidden="true" className="h-7 w-40" />;
  return <p className="text-sm text-fg-muted">{stats.state === "error" ? "Anteprima non disponibile" : "Nessuna quota generata"}</p>;
}

/** One plan of the society: its name and terms, and the three previews of how its people are doing. The whole card opens the plan. */
export function PlanCard({ plan, teamName, stats }: PlanCardProps) {
  return (
    <li className="relative flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft focus-within:ring-2 focus-within:ring-primary hover:-translate-y-0.5 hover:shadow-raised sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-base font-bold tracking-title text-fg">
          <Link href={`/quote/${plan.id}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
            {plan.name}
          </Link>
        </h3>
        <Badge variant={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "Attivo" : "Non attivo"}</Badge>
      </div>
      <p className="text-sm text-fg-muted">{describePlan(plan, teamName)}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <Previews stats={stats} />
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
      </div>
    </li>
  );
}
