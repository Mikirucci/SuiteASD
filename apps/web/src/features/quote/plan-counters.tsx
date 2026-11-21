import { AlertTriangle, Check, Clock } from "lucide-react";
import { ToneCount } from "@/components/ui";
import type { PlanStats } from "./types";

/**
 * The three small previews of a plan: people settled (green check), waiting (orange clock) and with a late fee
 * (red alert). The same trio sits on the plan card and, with its labels, at the top of the plan.
 */
/** On a card whose whole area is a link, the icons sit above the link so that their name tag can show on hover. */
export function PlanCounters({ stats, showLabels = false }: { stats: Pick<PlanStats, "paidPeople" | "pendingPeople" | "overduePeople">; showLabels?: boolean }) {
  const above = showLabels ? undefined : "relative z-10";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ToneCount tone="success" icon={Check} count={stats.paidPeople} label="persone in regola" showLabel={showLabels} className={above} />
      <ToneCount tone="warning" icon={Clock} count={stats.pendingPeople} label="persone in attesa" showLabel={showLabels} className={above} />
      <ToneCount tone="danger" icon={AlertTriangle} count={stats.overduePeople} label="persone con quote scadute" showLabel={showLabels} className={above} />
    </div>
  );
}
