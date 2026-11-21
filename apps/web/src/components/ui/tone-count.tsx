import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./tooltip";

export type CountTone = "success" | "warning" | "danger" | "brand";

const ICON_CLASSES: Record<CountTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  brand: "bg-primary-soft text-brand-700",
};

export interface ToneCountProps {
  tone: CountTone;
  icon: LucideIcon;
  count: number;
  /** What the number counts, read out in full by screen readers ("persone in regola"). */
  label: string;
  /** Show the label next to the number instead of only reading it out. */
  showLabel?: boolean;
  className?: string;
}

/**
 * A number with the small round icon of its state (check, clock, alert): the same preview on every group card.
 * The icon and the label carry the state as well as the colour.
 */
export function ToneCount({ tone, icon: Icon, count, label, showLabel = false, className }: ToneCountProps) {
  const counter = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", ICON_CLASSES[tone])}>
        <Icon className="size-4" />
      </span>
      <span className="text-sm font-bold text-fg">{count}</span>
      <span className={showLabel ? "text-sm text-fg-muted" : "sr-only"}>{label}</span>
    </span>
  );
  // With the label written next to it the icon needs no name tag
  return showLabel ? counter : <Tooltip label={label}>{counter}</Tooltip>;
}
