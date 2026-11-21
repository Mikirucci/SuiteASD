"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { ButtonLink, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dayToDate, formatEuro, pluralize } from "@/lib/format";
import { CategoryTile } from "./category-tile";
import { categoryText } from "./category-tone";
import { formatRange } from "./spese-period";
import type { LedgerSummary } from "./types";

type Category = LedgerSummary["categories"][number];

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 84;
const STROKE = 24;
const STROKE_ACTIVE = 32;
// A hairline between neighbours, as a share of the circle
const GAP = 0.008;
const EASE = [0.16, 1, 0.3, 1] as const;

export interface SpendingChartProps {
  categories: readonly Category[];
  totalCents: number;
  /** The category the pointer is on, in the chart or in the cards below it. */
  hovered: string | null;
  onHover: (category: string | null) => void;
  /** Where the page of a category is. */
  hrefOf: (category: string) => string;
}

function Readout({ category, totalCents, total, href, categories }: { category: Category | null; totalCents: number; total: number; href: string; categories: number }) {
  if (!category) {
    return (
      <div className="flex animate-fade-in flex-col items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-label text-fg-muted">Spese del periodo</p>
        <p className="text-2xl font-extrabold tracking-title text-fg">{formatEuro(totalCents)}</p>
        <p className="max-w-60 text-sm text-fg-muted">
          {pluralize(total, "spesa", "spese")} in {pluralize(categories, "categoria", "categorie")}. Passa su un colore, o toccalo, per vedere di quale si tratta.
        </p>
      </div>
    );
  }
  const share = Math.round((category.totalCents / totalCents) * 100);
  return (
    // The key makes the card fade in again each time the category changes
    <div key={category.category} className="flex animate-fade-in flex-col items-center gap-3">
      <div className="flex items-center gap-3 text-left">
        <CategoryTile category={category.category} />
        <h3 className="min-w-0 break-words text-lg font-bold tracking-title text-fg">{category.category}</h3>
      </div>
      <p className="text-2xl font-extrabold tracking-title text-fg">− {formatEuro(category.totalCents)}</p>
      <p className="text-sm text-fg-muted">
        {share}% del totale · {pluralize(category.count, "spesa", "spese")}
        <br />
        {formatRange({ from: dayToDate(category.firstOn), to: dayToDate(category.lastOn) })}
      </p>
      <ButtonLink href={href} variant="secondary">
        Apri la categoria
      </ButtonLink>
    </div>
  );
}

/**
 * Where the money went, as a ring that draws itself when the page opens. Passing over a colour (or focusing it, or
 * tapping it) lifts that slice and reads the category out next to the ring; the cards below do the same in the other
 * direction. The cards carry all the same figures as text, so the ring is a way in, never the only one.
 */
export function SpendingChart({ categories, totalCents, hovered, onHover, hrefOf }: SpendingChartProps) {
  const [pinned, setPinned] = useState<string | null>(null);
  const shown = categories.find((category) => category.category === (hovered ?? pinned)) ?? null;

  // Each slice starts where the ones before it end
  const slices = categories.map((category, index) => ({
    category,
    share: category.totalCents / totalCents,
    start: categories.slice(0, index).reduce((sum, before) => sum + before.totalCents, 0) / totalCents,
  }));

  return (
    <Card aria-label="Come si dividono le spese" as="section" className="flex flex-col items-center gap-6 text-center lg:sticky lg:top-6">
      <div className="relative mx-auto size-[220px] shrink-0">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Spese per categoria" className="size-full -rotate-90 overflow-visible">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-ink-100" />
          {slices.map(({ category, share, start: offset }, index) => {
            const active = shown?.category === category.category;
            return (
              <motion.circle
                key={category.category}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke="currentColor"
                role="button"
                tabIndex={0}
                aria-pressed={pinned === category.category}
                aria-label={`${category.category}, ${formatEuro(category.totalCents)}, ${Math.round(share * 100)}% del totale`}
                className={cn(categoryText(category.category), "cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary")}
                initial={{ pathLength: 0, pathOffset: offset, strokeWidth: STROKE }}
                animate={{ pathLength: Math.max(share - GAP, 0.002), pathOffset: offset, strokeWidth: active ? STROKE_ACTIVE : STROKE, opacity: shown && !active ? 0.35 : 1 }}
                transition={{ pathLength: { duration: 0.9, delay: index * 0.08, ease: EASE }, default: { duration: 0.2, ease: EASE } }}
                onPointerEnter={() => onHover(category.category)}
                onPointerLeave={() => onHover(null)}
                onFocus={() => onHover(category.category)}
                onBlur={() => onHover(null)}
                onClick={() => setPinned(pinned === category.category ? null : category.category)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPinned(pinned === category.category ? null : category.category);
                  }
                }}
              />
            );
          })}
        </svg>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold tracking-title text-fg">{shown ? `${Math.round((shown.totalCents / totalCents) * 100)}%` : categories.length}</span>
          <span className="text-sm text-fg-muted">{shown ? "del totale" : categories.length === 1 ? "categoria" : "categorie"}</span>
        </div>
      </div>
      <div aria-live="polite" className="min-h-40 w-full">
        <Readout
          category={shown}
          totalCents={totalCents}
          total={categories.reduce((sum, category) => sum + category.count, 0)}
          categories={categories.length}
          href={shown ? hrefOf(shown.category) : ""}
        />
      </div>
    </Card>
  );
}
