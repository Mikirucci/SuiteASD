"use client";

import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Radix gives the menu its keyboard behaviour (arrows, type-ahead, Escape), focus return and screen reader roles.
 * It is not modal: a modal menu locks the page while it closes, which breaks the dialogs that its items open.
 */
export function DropdownMenu(props: ComponentPropsWithoutRef<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root modal={false} {...props} />;
}
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align="end"
        sideOffset={6}
        // z-modal: the menu also opens from inside a dialog
        className={cn("z-modal min-w-48 rounded-lg bg-surface p-1 shadow-overlay ring-1 ring-line", className)}
        {...props}
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends Omit<ComponentPropsWithoutRef<typeof MenuPrimitive.Item>, "children"> {
  icon?: ReactNode;
  /** `danger` colours the label of a destructive action; the icon and the words still say what it does. */
  tone?: "default" | "danger";
  children: ReactNode;
}

export function DropdownMenuItem({ icon, tone = "default", className, children, ...props }: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-md px-3 text-sm font-semibold outline-none [&_svg]:size-4 [&_svg]:shrink-0",
        "data-[highlighted]:bg-ink-100 data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-subtle",
        tone === "danger" ? "text-danger" : "text-fg",
        className,
      )}
      {...props}
    >
      {icon ? <span aria-hidden="true" className="inline-flex">{icon}</span> : null}
      {children}
    </MenuPrimitive.Item>
  );
}
