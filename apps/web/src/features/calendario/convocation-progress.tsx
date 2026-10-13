import { ProgressBar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { confirmedText } from "./format";
import type { ConvocationSummary } from "./types";

export interface ConvocationProgressProps {
  summary: ConvocationSummary;
  /** Accessible name of the bar: say whose confirmations these are, e.g. the event title. */
  label: string;
  className?: string;
}

/** The "5/12 confermate" bar: confirmed athletes over the slots of the event. */
export function ConvocationProgress({ summary, label, className }: ConvocationProgressProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <ProgressBar
        className="flex-1"
        tone="success"
        value={summary.confirmed}
        max={summary.capacity}
        label={`Presenze confermate: ${label}`}
        valueText={`${summary.confirmed} su ${summary.capacity} confermate`}
      />
      <span className="shrink-0 text-sm font-bold tabular-nums text-fg">{confirmedText(summary)}</span>
    </div>
  );
}
