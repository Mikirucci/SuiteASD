import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardTone = "default" | "brand" | "success";
export type CardPadding = "none" | "sm" | "md" | "lg";

const toneClasses: Record<CardTone, string> = {
  default: "bg-surface text-fg",
  brand: "bg-primary text-white shadow-brand",
  success: "bg-success-soft text-success",
};

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  tone?: CardTone;
  padding?: CardPadding;
  /** Lifts the card on hover: only for cards that are links or buttons themselves. */
  interactive?: boolean;
}

/** White rounded surface with a soft tinted shadow. Never nest a Card inside a Card. */
export function Card({ as: Tag = "div", tone = "default", padding = "md", interactive, className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-lg",
        tone === "default" && "shadow-soft",
        toneClasses[tone],
        paddingClasses[padding],
        interactive && "transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised",
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3" | "h4";
  className?: string;
}

export function CardHeader({ title, description, action, as: Heading = "h3", className }: CardHeaderProps) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <Heading className="text-base font-bold tracking-title">{title}</Heading>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
