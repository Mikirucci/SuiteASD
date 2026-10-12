"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "success" | "info" | "danger";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto dismissal. Errors stay until dismissed unless set. */
  durationMs?: number;
}

interface ToastItemData extends ToastInput {
  id: number;
}

interface ToastApi {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 6000;

const toneConfig = {
  success: { Icon: CheckCircle2, iconClass: "text-mint-600" },
  info: { Icon: Info, iconClass: "text-primary-fg" },
  danger: { Icon: AlertCircle, iconClass: "text-danger" },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItemData[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current;
    nextId.current += 1;
    setItems((current) => [...current, { ...input, id }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The live region exists before any toast is added, so announcements are reliable */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-toast flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end"
      >
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ item, onDismiss }: { item: ToastItemData; onDismiss: (id: number) => void }) {
  const tone = item.tone ?? "info";
  const { Icon, iconClass } = toneConfig[tone];
  const [paused, setPaused] = useState(false);
  const duration = item.durationMs ?? (tone === "danger" ? undefined : DEFAULT_DURATION_MS);

  useEffect(() => {
    if (duration === undefined || paused) return undefined;
    const timer = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, paused, item.id, onDismiss]);

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-lg bg-surface p-4 shadow-raised ring-1 ring-line",
      )}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-fg">{item.title}</p>
        {item.description ? <p className="mt-0.5 text-sm text-fg-muted">{item.description}</p> : null}
      </div>
      <button
        type="button"
        aria-label="Chiudi notifica"
        onClick={() => onDismiss(item.id)}
        className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-ink-100 hover:text-fg"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
