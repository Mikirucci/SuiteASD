"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { buttonClasses, iconOnlySizeClasses, type ButtonSize, type ButtonVariant } from "./button-styles";
import { Tooltip } from "./tooltip";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, ignores clicks and sets aria-busy (focus is kept). */
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  type = "button",
  disabled,
  onClick,
  children,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      // Loading keeps focus and the variant colours (no native disabled); clicks are swallowed instead
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : leftIcon}
      {children}
      {loading ? null : rightIcon}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "leftIcon" | "rightIcon" | "fullWidth" | "children"> {
  /** Required: icon-only buttons have no visible text. It is also the hint shown on hover and focus. */
  "aria-label": string;
  icon: ReactNode;
}

export function IconButton({ icon, variant = "ghost", size = "md", loading, className, ...props }: IconButtonProps) {
  return (
    <Tooltip label={props["aria-label"]}>
      <Button
        variant={variant}
        size={size}
        loading={loading}
        className={cn("px-0", iconOnlySizeClasses[size], className)}
        {...props}
      >
        {loading ? null : icon}
      </Button>
    </Tooltip>
  );
}
