import { AlertTriangle, Check, Clock } from "lucide-react";
import { ToneCount } from "@/components/ui";
import type { TypeStats } from "./types";

/**
 * The three small previews of a document type: people in order (green check), with a document about to expire
 * (orange clock) and with one that is expired or missing (red alert).
 */
export function TypeCounters({ stats }: { stats: TypeStats }) {
  // The card is one big link: the icons sit above it so that their name tag can show on hover
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ToneCount tone="success" icon={Check} count={stats.validPeople} label="persone in regola" className="relative z-10" />
      <ToneCount tone="warning" icon={Clock} count={stats.expiringPeople} label="persone con il documento in scadenza" className="relative z-10" />
      <ToneCount tone="danger" icon={AlertTriangle} count={stats.expiredPeople + stats.missingPeople} label="persone con il documento scaduto o mancante" className="relative z-10" />
    </div>
  );
}
