import { AlertTriangle, Check, Clock, Zap } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "success" | "warning" | "danger" | "brand" | "neutral";

const toneClasses: Record<ChipTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  brand: "bg-primary-soft text-brand-700",
  neutral: "bg-ink-100 text-ink-700",
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  icon?: ReactNode;
  /** Uppercase, wide tracking: used for automation tags. */
  uppercase?: boolean;
}

/** Status chip with an optional icon: state is never conveyed by colour alone. */
export function Chip({ tone = "neutral", icon, uppercase, className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold [&_svg]:size-3.5 [&_svg]:shrink-0",
        uppercase && "uppercase tracking-label",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon ? <span aria-hidden="true" className="inline-flex">{icon}</span> : null}
      {children}
    </span>
  );
}

export type PaymentStatus = "paid" | "pending" | "overdue";

const paymentConfig: Record<PaymentStatus, { tone: ChipTone; label: string; icon: ReactNode }> = {
  paid: { tone: "success", label: "Pagato", icon: <Check strokeWidth={3} /> },
  pending: { tone: "warning", label: "In attesa", icon: <Clock /> },
  overdue: { tone: "danger", label: "Scaduto", icon: <AlertTriangle /> },
};

export function PaymentChip({ status, className }: { status: PaymentStatus; className?: string }) {
  const config = paymentConfig[status];
  return (
    <Chip tone={config.tone} icon={config.icon} className={className}>
      {config.label}
    </Chip>
  );
}

/** The recurring "automatic" tag: a Zap icon with an uppercase label. */
export function AutoChip({ children = "Automatico", className }: { children?: ReactNode; className?: string }) {
  return (
    <Chip tone="success" uppercase icon={<Zap fill="currentColor" />} className={className}>
      {children}
    </Chip>
  );
}
