import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Say what is missing and how to fill it. */
  description?: string;
  action?: ReactNode;
  /** Heading level; use h1 when the empty state is the whole page. */
  as?: "h1" | "h2" | "h3";
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, as: Heading = "h2", className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center rounded-lg bg-surface px-6 py-12 text-center shadow-soft", className)}
    >
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-md bg-primary-soft text-primary-fg">
        <Icon className="size-6" />
      </span>
      <Heading className="mt-4 text-base font-bold tracking-title text-fg">{title}</Heading>
      {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
