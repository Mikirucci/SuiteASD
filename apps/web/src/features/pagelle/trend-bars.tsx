"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { formatGrade, gradeTone } from "@/components/ui/progress-ring";
import { cn } from "@/lib/cn";
import type { TrendPoint } from "./types";

const FILL: Record<ReturnType<typeof gradeTone>, string> = {
  brand: "bg-primary",
  success: "bg-mint-600",
  warning: "bg-orange-600",
  danger: "bg-red-600",
};

const dayFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const MAX_POINTS = 12;

/**
 * Ratings over time, oldest on the left. Bars grow from the baseline (transform only) and each one links to its report card.
 * The value is written above every bar, so the colour band is a bonus and never the only signal.
 */
export function TrendBars({ points }: { points: readonly TrendPoint[] }) {
  const shown = points.slice(-MAX_POINTS);
  return (
    <ol
      aria-label="Andamento dei voti, dal più vecchio al più recente"
      className="flex items-end gap-2 overflow-x-auto pb-1"
    >
      {shown.map((point, index) => {
        const label = point.playedAt ? dayFormat.format(new Date(point.playedAt)) : "senza data";
        return (
          <li key={point.matchId} className="flex min-w-12 flex-1 flex-col items-center">
            <Link
              href={`/pagelle/partita/${point.matchId}`}
              aria-label={`Voto ${formatGrade(point.rating)}, partita del ${label}. Apri la pagella`}
              className="group flex min-h-11 w-full flex-col items-center gap-1 rounded-sm"
            >
              <span className="text-sm font-bold tabular-nums text-fg">{formatGrade(point.rating)}</span>
              <span className="flex h-24 w-full items-end justify-center">
                <motion.span
                  className={cn(
                    "block h-full w-6 origin-bottom rounded-sm transition-opacity group-hover:opacity-80",
                    FILL[gradeTone(point.rating)],
                  )}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: point.rating / 10 }}
                  transition={{ duration: 0.6, delay: Math.min(index, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
              <span className="text-xs text-fg-muted">{label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
