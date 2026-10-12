"use client";

import { cn } from "@/lib/cn";

export interface PillOption {
  value: string;
  label: string;
}

export interface PillFilterProps {
  options: readonly PillOption[];
  value: string;
  onChange: (value: string) => void;
  /** Describes what is filtered, e.g. "Filtra per squadra". */
  label: string;
  className?: string;
}

/** Single-choice filter: the active pill is solid blue, the others are white. */
export function PillFilter({ options, value, onChange, label, className }: PillFilterProps) {
  return (
    <div role="group" aria-label={label} className={cn("-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "touch-target h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-150 ease-soft",
              active
                ? "bg-primary text-white shadow-brand hover:bg-primary-hover"
                : "bg-surface text-fg-muted shadow-soft ring-1 ring-inset ring-line hover:bg-ink-50 hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
