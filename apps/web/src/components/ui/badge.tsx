import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "team" | "neutral" | "brand" | "success" | "warning" | "danger";

const variantClasses: Record<BadgeVariant, string> = {
  team: "bg-ink-100 text-ink-700",
  neutral: "bg-surface text-fg-muted ring-1 ring-inset ring-line",
  brand: "bg-primary-soft text-brand-700",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** `team` is the light grey tag next to a name (U14, U16, Serie D). */
  variant?: BadgeVariant;
}

export function Badge({ variant = "team", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
