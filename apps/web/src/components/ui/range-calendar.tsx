"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addDays, isSameDay, startOfDay, startOfWeek } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";

export interface CalendarRange {
  from: Date;
  to: Date;
}

export interface RangeCalendarProps {
  /** Range shown as selected, and the month the calendar opens on. */
  value?: CalendarRange;
  /** `range`: two clicks, the first and the last day. `week`: one click on any day chooses its whole week. */
  selection?: "range" | "week";
  /** Called once the range is chosen (both days, or the week), with the earlier day first. */
  onChange: (range: CalendarRange) => void;
  className?: string;
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
const monthFormat = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** The six weeks that show a month, Monday first, with the days of the neighbouring months that fill them. */
function weeksOf(month: Date): Date[][] {
  const first = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(first, week * 7 + day)));
}

/**
 * Month calendar to pick a period: the first click sets the first day, the second the last one (in any order).
 * Every day is a button, so the keyboard and screen readers reach the same days as the mouse.
 */
export function RangeCalendar({ value, selection = "range", onChange, className }: RangeCalendarProps) {
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => new Date((value?.from ?? today).getFullYear(), (value?.from ?? today).getMonth(), 1));
  // The first day of a range being chosen: until the second click the old range is not shown
  const [start, setStart] = useState<Date | null>(null);

  const from = start ?? value?.from;
  const to = start ?? value?.to;

  const pick = (day: Date) => {
    if (selection === "week") {
      const first = startOfWeek(day);
      onChange({ from: first, to: addDays(first, 6) });
      return;
    }
    if (!start) {
      setStart(day);
      return;
    }
    setStart(null);
    onChange(day < start ? { from: day, to: start } : { from: start, to: day });
  };

  const monthLabel = monthFormat.format(month);
  const goTo = (step: -1 | 1) => setMonth(new Date(month.getFullYear(), month.getMonth() + step, 1));

  return (
    <div role="group" aria-label="Calendario" className={cn("flex w-full max-w-sm flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <IconButton aria-label="Mese precedente" icon={<ChevronLeft />} onClick={() => goTo(-1)} />
        <p aria-live="polite" className="text-sm font-bold capitalize text-fg">
          {monthLabel}
        </p>
        <IconButton aria-label="Mese successivo" icon={<ChevronRight />} onClick={() => goTo(1)} />
      </div>

      <p className="text-sm text-fg-muted">
        {selection === "week" ? "Scegli un giorno: vale tutta la sua settimana." : start ? "Ora scegli l'ultimo giorno." : "Scegli il primo e l'ultimo giorno."}
      </p>

      <div className="grid grid-cols-7 gap-y-1 text-center" role="presentation">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} aria-hidden="true" className="pb-1 text-xs font-semibold uppercase tracking-label text-fg-muted">
            {weekday}
          </span>
        ))}
        {weeksOf(month)
          .flat()
          .map((day) => {
            const isEdge = Boolean((from && isSameDay(day, from)) || (to && isSameDay(day, to)));
            const inRange = Boolean(from && to && day >= from && day <= to);
            const outside = day.getMonth() !== month.getMonth();
            return (
              <button
                key={day.getTime()}
                type="button"
                aria-pressed={inRange}
                aria-label={dayFormat.format(day)}
                onClick={() => pick(day)}
                className={cn(
                  "h-10 text-sm font-semibold transition-colors duration-150 ease-soft",
                  inRange && !isEdge && "bg-primary-soft text-brand-700",
                  inRange && from && isSameDay(day, from) && "rounded-l-full",
                  inRange && to && isSameDay(day, to) && "rounded-r-full",
                  !inRange && "rounded-full hover:bg-ink-100",
                  isEdge && "bg-primary text-white shadow-brand hover:bg-primary-hover",
                  !inRange && outside && "text-fg-subtle",
                  !inRange && !outside && "text-fg",
                  isSameDay(day, today) && !isEdge && "ring-1 ring-inset ring-brand-500",
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
      </div>
    </div>
  );
}
