import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "danger" | "success" | "info";

const toneConfig = {
  danger: { classes: "bg-danger-soft text-danger ring-danger-line", Icon: AlertCircle, role: "alert" },
  success: { classes: "bg-success-soft text-success ring-success-line", Icon: CheckCircle2, role: "status" },
  info: { classes: "bg-primary-soft text-brand-800 ring-brand-200", Icon: Info, role: "status" },
} as const;

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Inline message tied to a form or a section (use Toast for transient feedback). */
export function Alert({ tone = "info", title, children, className }: AlertProps) {
  const { classes, Icon, role } = toneConfig[tone];
  return (
    <div role={role} className={cn("flex items-start gap-3 rounded-md p-4 text-sm ring-1 ring-inset", classes, className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-bold">{title}</p> : null}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}
