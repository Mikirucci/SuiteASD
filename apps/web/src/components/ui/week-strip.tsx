"use client";

import { useEffect, useRef } from "react";
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
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedKey = toDayKey(selected);

  // On narrow screens the strip scrolls: bring the selected day to the middle of the visible part
  useEffect(() => {
    const group = groupRef.current;
    const current = group?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!group || !current) return;
    group.scrollLeft = current.offsetLeft - (group.clientWidth - current.offsetWidth) / 2;
  }, [selectedKey]);

  const first = startOfWeek(weekOf);
  const eventKeys = new Set(eventDays.map(toDayKey));
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));

  return (
    // Each day keeps a 44px target: below ~340px the row scrolls on its own instead of squeezing the buttons.
    // The padding (offset by the negative margin) leaves room for shadows and the focus ring inside the scroll area.
    <div
      ref={groupRef}
      role="group"
      aria-label="Giorni della settimana"
      className={cn("relative -m-1 flex gap-1.5 overflow-x-auto p-1 sm:gap-2", className)}
    >
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
              "flex min-h-16 min-w-11 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-md py-2 transition-colors duration-150 ease-soft",
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
