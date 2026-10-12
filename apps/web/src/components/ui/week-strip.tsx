"use client";

import { addDays, isSameDay, startOfWeek, toDayKey } from "@/lib/dates";
import { cn } from "@/lib/cn";

export interface WeekStripProps {
  /** Any date inside the week to show (weeks start on Monday). */
  weekOf: Date;
  selected: Date;
  onSelect: (date: Date) => void;
  /** Days that have at least one event: they get a green dot. */
  eventDays?: readonly Date[];
  className?: string;
}

const weekdayFormat = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
const monthFormat = new Intl.DateTimeFormat("it-IT", { month: "long" });

export function WeekStrip({ weekOf, selected, onSelect, eventDays = [], className }: WeekStripProps) {
  const first = startOfWeek(weekOf);
  const eventKeys = new Set(eventDays.map(toDayKey));
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));

  return (
    <div role="group" aria-label="Giorni della settimana" className={cn("grid grid-cols-7 gap-1.5 sm:gap-2", className)}>
      {days.map((day) => {
        const isSelected = isSameDay(day, selected);
        const hasEvent = eventKeys.has(toDayKey(day));
        return (
          <button
            key={toDayKey(day)}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(day)}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-md py-2 transition-colors duration-150 ease-soft",
              isSelected
                ? "bg-primary text-white shadow-brand"
                : "bg-surface text-fg shadow-soft hover:bg-ink-50",
            )}
          >
            <span className={cn("text-xs font-semibold uppercase tracking-label", isSelected ? "text-white" : "text-fg-muted")}>
              {weekdayFormat.format(day).replace(".", "")}
            </span>{" "}
            <span className="text-lg font-bold tracking-title">{day.getDate()}</span>{" "}
            {/* Visible text stays part of the accessible name (WCAG 2.5.3); the rest is added for screen readers */}
            <span className="sr-only">
              {monthFormat.format(day)}, {hasEvent ? "con eventi" : "nessun evento"}
            </span>
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", hasEvent ? (isSelected ? "bg-mint-300" : "bg-mint-600") : "bg-transparent")}
            />
          </button>
        );
      })}
    </div>
  );
}
