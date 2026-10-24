"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, Popover, PopoverContent, PopoverTrigger, RangeCalendar, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPeriod, modeOf, rangeOf, shiftRange, type DayRange, type PeriodMode } from "./spese-period";
import type { SpesePeriod } from "./use-spese-period";

const TABS: ReadonlyArray<{ value: PeriodMode; label: string }> = [
  { value: "week", label: "Settimana" },
  { value: "month", label: "Mese" },
  { value: "year", label: "Anno" },
  { value: "custom", label: "Intervallo" },
];

const monthName = new Intl.DateTimeFormat("it-IT", { month: "short" });
const monthAndYear = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
const YEARS_SHOWN = 12;

const cellClasses = (selected: boolean, current: boolean) =>
  cn(
    "touch-target h-11 rounded-md text-sm font-semibold capitalize transition-colors duration-150 ease-soft",
    selected ? "bg-primary text-white shadow-brand hover:bg-primary-hover" : "text-fg hover:bg-ink-100",
    current && !selected && "ring-1 ring-inset ring-brand-500",
  );

/** The twelve months of a year, with arrows to go to another year. */
function MonthGrid({ range, onPick }: { range: DayRange; onPick: (range: DayRange) => void }) {
  const [year, setYear] = useState(range.from.getFullYear());
  const now = new Date();
  const chosen = modeOf(range) === "month" ? range.from : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <IconButton aria-label="Anno precedente" icon={<ChevronLeft />} onClick={() => setYear(year - 1)} />
        <p aria-live="polite" className="text-sm font-bold text-fg">
          {year}
        </p>
        <IconButton aria-label="Anno successivo" icon={<ChevronRight />} onClick={() => setYear(year + 1)} />
      </div>
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, month) => {
          const first = new Date(year, month, 1);
          const selected = chosen?.getFullYear() === year && chosen.getMonth() === month;
          return (
            <button
              key={month}
              type="button"
              aria-pressed={selected}
              aria-label={monthAndYear.format(first)}
              onClick={() => onPick(rangeOf("month", first))}
              className={cellClasses(selected, now.getFullYear() === year && now.getMonth() === month)}
            >
              {monthName.format(first).replace(".", "")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A window of twelve years, with arrows to move the window. */
function YearGrid({ range, onPick }: { range: DayRange; onPick: (range: DayRange) => void }) {
  const now = new Date();
  // The year on screen sits a little past the middle: the years behind it are the ones that hold expenses
  const [first, setFirst] = useState(range.from.getFullYear() - 7);
  const chosen = modeOf(range) === "year" ? range.from.getFullYear() : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <IconButton aria-label="Anni precedenti" icon={<ChevronLeft />} onClick={() => setFirst(first - YEARS_SHOWN)} />
        <p aria-live="polite" className="text-sm font-bold text-fg">
          {first} – {first + YEARS_SHOWN - 1}
        </p>
        <IconButton aria-label="Anni successivi" icon={<ChevronRight />} onClick={() => setFirst(first + YEARS_SHOWN)} />
      </div>
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: YEARS_SHOWN }, (_, index) => {
          const year = first + index;
          return (
            <button
              key={year}
              type="button"
              aria-pressed={chosen === year}
              onClick={() => onPick(rangeOf("year", new Date(year, 0, 1)))}
              className={cellClasses(chosen === year, now.getFullYear() === year)}
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The period the page is about, in the middle of the page: the arrows go to the one before and the one after, and the
 * period between them opens a panel to choose a week, a month, a year or any range. "Azzera filtri" appears when it is
 * not the current year.
 */
export function SpesePeriodBar({ period }: { period: SpesePeriod }) {
  const { range, setRange, reset, changed } = period;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PeriodMode>(() => modeOf(range));

  const pick = (next: DayRange) => {
    setRange(next);
    setOpen(false);
  };

  return (
    <div className="grid items-center justify-items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <span aria-hidden="true" className="hidden sm:block" />
      <div role="group" aria-label="Periodo" className="flex w-full max-w-sm items-center gap-2 sm:w-auto sm:max-w-none">
        <IconButton variant="secondary" className="shrink-0" aria-label="Periodo precedente" icon={<ChevronLeft />} onClick={() => setRange(shiftRange(range, -1))} />
        <Popover
          open={open}
          onOpenChange={(next) => {
            // Each time it opens it starts on the kind of period on screen
            if (next) setTab(modeOf(range));
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="touch-target flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-surface px-4 text-sm font-bold text-fg sm:min-w-52 sm:flex-none sm:px-5 sm:text-base shadow-soft ring-1 ring-inset ring-line transition-[background-color,box-shadow] duration-150 ease-soft hover:bg-ink-50 hover:shadow-raised"
            >
              <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-brand-700" />
              <span aria-live="polite" className="truncate">
                {formatPeriod(range)}
              </span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" aria-label="Scegli il periodo" className="w-[22rem]">
            <Tabs value={tab} onValueChange={(value) => setTab(value as PeriodMode)}>
              <TabsList className="flex w-full">
                {TABS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} className="flex-1 px-2">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="week">
                <RangeCalendar selection="week" value={modeOf(range) === "week" ? range : undefined} onChange={pick} />
              </TabsContent>
              <TabsContent value="month">
                <MonthGrid range={range} onPick={pick} />
              </TabsContent>
              <TabsContent value="year">
                <YearGrid range={range} onPick={pick} />
              </TabsContent>
              <TabsContent value="custom">
                <RangeCalendar value={modeOf(range) === "custom" ? range : undefined} onChange={pick} />
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
        <IconButton variant="secondary" className="shrink-0" aria-label="Periodo successivo" icon={<ChevronRight />} onClick={() => setRange(shiftRange(range, 1))} />
      </div>
      {changed ? (
        <Button variant="ghost" leftIcon={<RotateCcw />} onClick={reset} className="sm:justify-self-start">
          Azzera filtri
        </Button>
      ) : (
        <span aria-hidden="true" className="hidden sm:block" />
      )}
    </div>
  );
}
