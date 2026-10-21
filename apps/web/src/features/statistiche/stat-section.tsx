import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface StatSectionProps {
  title: string;
  /** One plain sentence on how to read the block below. */
  hint: string;
  /** Control that belongs to the whole block, e.g. the chart/table switch. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A block of the page: h2 title, a reading hint, then its content. Same anatomy everywhere keeps the page aligned. */
export function StatSection({ title, hint, action, className, children }: StatSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={headingId} className="text-lg font-bold tracking-title text-fg">
            {title}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            <span className="font-semibold text-fg">Come leggere.</span> {hint}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
