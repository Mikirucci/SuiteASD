"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import type { LedgerTrend } from "./types";

const monthShort = new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** A bar is never thinner than this, so a long period scrolls sideways inside the chart instead of squeezing the bars. */
const MIN_COLUMN_PX = 14;

const moment = (key: string): Date => new Date(key.length === 7 ? `${key}-01T00:00:00.000Z` : `${key}T00:00:00.000Z`);

/** "novembre 2026" for a month, "giovedì 5 novembre 2026" for a day: the whole name, for the table and the readout. */
function longLabel(key: string): string {
  return (key.length === 7 ? monthLong : dayLong).format(moment(key));
}

/** What sits under a bar: the month ("nov") or the day of the month ("5"). */
function shortLabel(key: string): string {
  return key.length === 7 ? monthShort.format(moment(key)).replace(".", "") : String(moment(key).getUTCDate());
}

const signed = (cents: number): string => `${cents < 0 ? "− " : ""}${formatEuro(Math.abs(cents))}`;
/** An average in whole euros: the cents of a mean say nothing. */
const wholeEuros = (cents: number): number => Math.round(cents / 100) * 100;
const percent = (part: number, whole: number): number => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** A bar in proportion to the biggest figure of the period, never thinner than a line so a small amount is still seen. */
function Bar({ cents, max, className }: { cents: number; max: number; className: string }) {
  return <span className={cn("block w-full max-w-4 rounded-t-sm", className)} style={{ height: cents === 0 ? 0 : `${Math.max((cents / max) * 100, 2)}%` }} />;
}

function Legend() {
  return (
    <ul aria-label="Legenda" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-muted">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-3 rounded-sm bg-mint-600" />
        Entrate
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-3 rounded-sm bg-primary" />
        Uscite
      </li>
    </ul>
  );
}

interface ReadoutProps {
  trend: LedgerTrend;
  /** The bucket the person is on, or none: then the readout says how to read the chart. */
  index: number | null;
  max: number;
  unit: string;
}

/**
 * The figures of the bar that is pointed at, tapped or reached with the arrows: the amounts, the balance and what the
 * bar weighs on the period, so a bar tells more than its height. It is read out as it changes.
 */
function Readout({ trend, index, max, unit }: ReadoutProps) {
  const bucket = index === null ? undefined : trend.buckets[index];
  const { totals, buckets } = trend;
  return (
    <div aria-live="polite" className="min-h-28 rounded-md bg-ink-50 p-4">
      {bucket ? (
        <div key={bucket.key} className="flex animate-fade-in flex-col gap-3">
          <p className="text-sm font-bold capitalize text-fg">{longLabel(bucket.key)}</p>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">Entrate</dt>
              <dd className="text-base font-extrabold tabular-nums text-success">{formatEuro(bucket.incomeCents)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">Uscite</dt>
              <dd className="text-base font-extrabold tabular-nums text-fg">{formatEuro(bucket.expenseCents)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">Saldo</dt>
              <dd className={cn("text-base font-extrabold tabular-nums", bucket.balanceCents < 0 ? "text-danger" : "text-fg")}>{signed(bucket.balanceCents)}</dd>
            </div>
          </dl>
          <p className="text-sm text-fg-muted">
            Pesa il {percent(bucket.incomeCents, totals.incomeCents)}% delle entrate e il {percent(bucket.expenseCents, totals.expenseCents)}% delle uscite del periodo. In media per {unit}:
            entrate {formatEuro(wholeEuros(totals.incomeCents / buckets.length))}, uscite {formatEuro(wholeEuros(totals.expenseCents / buckets.length))}.
          </p>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">
          Passa il mouse su una barra, toccala o usa le frecce della tastiera per vedere le cifre del {unit}. La barra più alta vale {formatEuro(max)}.
        </p>
      )}
    </div>
  );
}

/**
 * Incomes and expenses of the period, one pair of bars for each day or month. Pointing at a bar, tapping it (it stays
 * chosen until the next tap) or moving with the arrows shows its figures under the chart. The bars are only a picture:
 * the same numbers are in the table behind the button, which is what a screen reader reads.
 */
export function TrendChart({ trend }: { trend: LedgerTrend }) {
  const [asTable, setAsTable] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const { buckets, totals, granularity } = trend;
  const max = Math.max(1, ...buckets.flatMap((bucket) => [bucket.incomeCents, bucket.expenseCents]));
  // Labels under at most about twelve bars: a day-by-day month would not fit them all
  const every = Math.ceil(buckets.length / 12);
  const unit = granularity === "MONTH" ? "mese" : "giorno";
  const shown = hovered ?? pinned;

  if (totals.incomeCents === 0 && totals.expenseCents === 0) {
    return <EmptyState as="h3" icon={BarChart3} title="Nessun movimento in questo periodo" description="Cambia periodo: entrate e uscite compaiono appena vengono registrate." />;
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = buckets.length - 1;
    // From nowhere, the right arrow goes to the first bar and the left one to the last
    const next: Record<string, number | null> = {
      ArrowRight: pinned === null ? 0 : Math.min(pinned + 1, last),
      ArrowLeft: pinned === null ? last : Math.max(pinned - 1, 0),
      Home: 0,
      End: last,
      Escape: null,
    };
    if (!(event.key in next)) return;
    event.preventDefault();
    setPinned(next[event.key] ?? null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <Button variant="ghost" size="sm" leftIcon={asTable ? <BarChart3 /> : <Table2 />} onClick={() => setAsTable((current) => !current)}>
          {asTable ? "Mostra come grafico" : "Mostra come tabella"}
        </Button>
      </div>

      {asTable ? (
        <div className="max-h-96 overflow-auto" tabIndex={0} role="region" aria-label="Entrate e uscite, in tabella">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{`Entrate, uscite e saldo di ogni ${unit} del periodo`}</caption>
            <thead>
              <tr className="border-b border-line">
                {["Periodo", "Entrate", "Uscite", "Saldo"].map((heading, index) => (
                  <th key={heading} scope="col" className={cn("py-2 text-xs font-bold uppercase tracking-label text-fg-muted", index > 0 && "text-right")}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.key} className="border-b border-line last:border-b-0">
                  <th scope="row" className="py-2 font-semibold capitalize text-fg">
                    {longLabel(bucket.key)}
                  </th>
                  <td className="py-2 text-right tabular-nums text-fg">{formatEuro(bucket.incomeCents)}</td>
                  <td className="py-2 text-right tabular-nums text-fg">{formatEuro(bucket.expenseCents)}</td>
                  <td className="py-2 text-right font-bold tabular-nums text-fg">{signed(bucket.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure className="flex flex-col gap-3" aria-label="Entrate e uscite del periodo">
          <div className="overflow-x-auto pb-1">
            {/* The arrows move between the bars; the bars themselves are not controls, so the keyboard has one stop here */}
            <div
              role="group"
              tabIndex={0}
              aria-label="Entrate e uscite per periodo: usa le frecce per scorrere i periodi"
              onKeyDown={onKeyDown}
              onPointerLeave={() => setHovered(null)}
              className="rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              style={{ minWidth: buckets.length * MIN_COLUMN_PX }}
            >
              <div className="flex h-48 items-end gap-1 border-b border-line">
                {buckets.map((bucket, index) => (
                  <div
                    key={bucket.key}
                    aria-hidden="true"
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") setHovered(index);
                    }}
                    onClick={() => setPinned((current) => (current === index ? null : index))}
                    className={cn(
                      "flex h-full min-w-0 flex-1 cursor-pointer items-end justify-center gap-px rounded-t-sm transition-[background-color,opacity] duration-150 ease-soft",
                      shown === index ? "bg-primary-soft" : "hover:bg-ink-50",
                      shown !== null && shown !== index && "opacity-60",
                    )}
                  >
                    <Bar cents={bucket.incomeCents} max={max} className="bg-mint-600" />
                    <Bar cents={bucket.expenseCents} max={max} className="bg-primary" />
                  </div>
                ))}
              </div>
              <div aria-hidden="true" className="mt-1 flex gap-1">
                {buckets.map((bucket, index) => (
                  <span key={bucket.key} className={cn("min-w-0 flex-1 truncate text-center text-xs capitalize text-fg-muted", shown === index && "font-bold text-fg")}>
                    {index % every === 0 || shown === index ? shortLabel(bucket.key) : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <Readout trend={trend} index={shown} max={max} unit={unit} />
        </figure>
      )}
    </div>
  );
}
