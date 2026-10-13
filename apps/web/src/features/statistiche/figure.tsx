import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface FigureProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "success";
}

/** One headline number of a <dl>: small uppercase label, big value, optional note. */
export function Figure({ label, value, note, tone }: FigureProps) {
  return (
    <div className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</dt>
      <dd className={cn("text-2xl font-extrabold tracking-title tabular-nums", tone === "success" ? "text-success" : "text-fg")}>{value}</dd>
      {note ? <dd className="text-sm text-fg-muted">{note}</dd> : null}
    </div>
  );
}
