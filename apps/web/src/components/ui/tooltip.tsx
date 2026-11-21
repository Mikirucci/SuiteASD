"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactElement } from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  /** What the icon is, in a few words. Keep it short: it is a hint, not a help text. */
  label: string;
  /** The single element that opens the hint; it receives the hover and focus handlers. */
  children: ReactElement;
  side?: "top" | "bottom";
  className?: string;
}

/**
 * A light name tag for an icon, shown on hover and on keyboard focus. Radix keeps it dismissible with Escape and
 * hoverable without it vanishing (WCAG 1.4.13). It repeats what the element already says to screen readers, so it
 * never carries information that is not available some other way.
 */
export function Tooltip({ label, children, side = "top", className }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            // z-modal: icons inside a dialog also get their name tag
            className={cn(
              "z-modal max-w-60 rounded-md bg-surface px-2 py-1 text-xs font-semibold text-fg shadow-soft ring-1 ring-line",
              className,
            )}
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
