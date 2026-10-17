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

/** The "5/12 confermate" bar: confirmed athletes over the slots of the event (full when more confirmed than slots). */
export function ConvocationProgress({ summary, label, className }: ConvocationProgressProps) {
  const over = summary.confirmed > summary.capacity;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <ProgressBar
        className="flex-1"
        tone="success"
        value={Math.min(summary.confirmed, summary.capacity)}
        max={summary.capacity}
        label={`Presenze confermate: ${label}`}
        valueText={over ? `${summary.confirmed} confermati, posti ${summary.capacity}` : `${summary.confirmed} su ${summary.capacity} confermate`}
      />
      <span className="shrink-0 text-sm font-bold tabular-nums text-fg">{confirmedText(summary)}</span>
    </div>
  );
}
