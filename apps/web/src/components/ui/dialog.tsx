"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Radix Dialog gives us focus trap, Escape to close, scroll lock and focus return. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-ink-950/50 data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
  );
}

export function CloseButton() {
  return (
    <DialogPrimitive.Close
      aria-label="Chiudi"
      className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-ink-100 hover:text-fg"
    >
      <X aria-hidden="true" className="size-5" />
    </DialogPrimitive.Close>
  );
}

export interface DialogContentProps {
  title: string;
  description?: string;
  children?: ReactNode;
  /** Action row, usually a secondary and a primary Button. */
  footer?: ReactNode;
  className?: string;
}

export function DialogContent({ title, description, children, footer, className }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        // Radix warns when there is no description; opt out explicitly in that case
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed left-1/2 top-1/2 z-modal flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-xl bg-surface p-6 shadow-overlay data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in",
          className,
        )}
      >
        <DialogPrimitive.Title className="pr-10 text-lg font-bold tracking-title text-fg">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">{description}</DialogPrimitive.Description>
        ) : null}
        {children ? <div className="mt-4 overflow-y-auto">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
        <CloseButton />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
