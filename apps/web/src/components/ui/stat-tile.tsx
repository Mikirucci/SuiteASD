import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { CountTone } from "./tone-count";

const VALUE_CLASSES: Record<CountTone | "default", string> = {
  default: "text-fg",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  brand: "text-brand-700",
};

const ICON_CLASSES: Record<CountTone | "default", string> = {
  default: "bg-ink-100 text-ink-700",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  brand: "bg-primary-soft text-brand-700",
};

export interface StatTileProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: CountTone | "default";
  icon?: LucideIcon;
  className?: string;
}

/** One figure of a report: label, big value, an optional note. Sits in a grid with its siblings, never inside a Card. */
export function StatTile({ label, value, note, tone = "default", icon: Icon, className }: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg bg-surface p-4 shadow-soft sm:p-5", className)}>
      <div className="flex items-center gap-2">
        {Icon ? (
          <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", ICON_CLASSES[tone])}>
            <Icon className="size-4" />
          </span>
        ) : null}
        <p className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</p>
      </div>
      <p className={cn("text-2xl font-extrabold tracking-title", VALUE_CLASSES[tone])}>{value}</p>
      {note ? <div className="text-sm text-fg-muted">{note}</div> : null}
    </div>
  );
}
