import { Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type StatusMarkState = "ok" | "expiring" | "missing";

const config = {
  ok: { classes: "bg-success-soft text-success", Icon: Check, text: "In regola" },
  expiring: { classes: "bg-warning-soft text-warning", Icon: Clock, text: "In scadenza" },
  missing: { classes: "bg-danger-soft text-danger", Icon: X, text: "Mancante o scaduto" },
} as const;

export interface StatusMarkProps {
  state: StatusMarkState;
  /** What is being checked, e.g. "Certificato medico". Read by screen readers. */
  label: string;
  className?: string;
}

/** Small square indicator for a document status (green check, amber clock, red cross). */
export function StatusMark({ state, label, className }: StatusMarkProps) {
  const { classes, Icon, text } = config[state];
  return (
    <span
      role="img"
      aria-label={`${label}: ${text}`}
      title={`${label}: ${text}`}
      className={cn("inline-flex size-6 items-center justify-center rounded-sm", classes, className)}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={3} />
    </span>
  );
}
