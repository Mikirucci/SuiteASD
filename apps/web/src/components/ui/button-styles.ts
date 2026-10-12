import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-brand hover:bg-primary-hover active:bg-primary-active disabled:bg-surface-muted disabled:text-fg-subtle disabled:shadow-none",
  secondary:
    "border border-line bg-surface text-fg shadow-soft hover:bg-ink-50 active:bg-ink-100 disabled:bg-surface-muted disabled:text-fg-subtle disabled:shadow-none",
  soft: "bg-primary-soft text-brand-700 hover:bg-brand-100 active:bg-brand-200 disabled:bg-surface-muted disabled:text-fg-subtle",
  ghost: "text-fg-muted hover:bg-ink-100 hover:text-fg active:bg-ink-200 disabled:text-fg-subtle",
  danger:
    "bg-danger-solid text-white hover:bg-danger active:bg-red-700 disabled:bg-surface-muted disabled:text-fg-subtle",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-10 gap-1.5 px-3 text-sm",
  md: "h-11 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
};

export const iconOnlySizeClasses: Record<ButtonSize, string> = {
  sm: "size-10",
  md: "size-11",
  lg: "size-12",
};

const baseClasses =
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-semibold " +
  "transition-[background-color,color,transform,box-shadow] duration-150 ease-soft " +
  "active:translate-y-px disabled:cursor-not-allowed disabled:translate-y-0 aria-busy:cursor-progress [&_svg]:size-4 [&_svg]:shrink-0";

/** Class list of a button: reuse it for links that must look like buttons (see ButtonLink). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {}): string {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], fullWidth && "w-full");
}

