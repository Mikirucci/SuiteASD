"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Radix Popover: a panel that opens under its button; Escape or a click outside closes it and focus goes back to the button. */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, align = "start", ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={8}
        collisionPadding={16}
        className={cn(
          "z-modal max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-2rem)] animate-fade-in overflow-y-auto rounded-lg bg-surface p-4 shadow-raised ring-1 ring-line",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
