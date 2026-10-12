"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CloseButton, DialogOverlay } from "./dialog";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export type DrawerSide = "left" | "right" | "bottom";

const sideClasses: Record<DrawerSide, string> = {
  left: "inset-y-0 left-0 w-[min(20rem,calc(100vw-2rem))] rounded-r-xl data-[state=closed]:animate-drawer-left-out data-[state=open]:animate-drawer-left-in",
  right:
    "inset-y-0 right-0 w-[min(28rem,calc(100vw-2rem))] rounded-l-xl data-[state=closed]:animate-drawer-right-out data-[state=open]:animate-drawer-right-in",
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl data-[state=closed]:animate-drawer-bottom-out data-[state=open]:animate-drawer-bottom-in",
};

export interface DrawerContentProps {
  title: string;
  description?: string;
  side?: DrawerSide;
  children?: ReactNode;
  className?: string;
}

/** Same accessibility behaviour as Dialog, anchored to a screen edge. */
export function DrawerContent({ title, description, side = "right", children, className }: DrawerContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn("fixed z-modal flex flex-col bg-surface p-6 shadow-overlay", sideClasses[side], className)}
      >
        <DialogPrimitive.Title className="pr-10 text-lg font-bold tracking-title text-fg">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">{description}</DialogPrimitive.Description>
        ) : null}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>
        <CloseButton />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
