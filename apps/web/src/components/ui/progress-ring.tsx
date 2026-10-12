"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

export type RingTone = "brand" | "success" | "warning" | "danger";

const strokeClasses: Record<RingTone, string> = {
  brand: "stroke-primary",
  success: "stroke-mint-600",
  warning: "stroke-orange-600",
  danger: "stroke-red-600",
};

/** Colour band of a 1-10 grade: >= 8 blue, 7-7.9 green, 6-6.9 orange, below 6 red. */
export function gradeTone(grade: number): RingTone {
  if (grade >= 8) return "brand";
  if (grade >= 7) return "success";
  if (grade >= 6) return "warning";
  return "danger";
}

export function formatGrade(grade: number): string {
  return grade.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const RADIUS = 42;

export interface ProgressRingProps {
  value: number;
  max?: number;
  tone?: RingTone;
  /** Pixel size of the ring. */
  size?: number;
  /** Accessible description, e.g. "Voto di Giulia Rossi". */
  label: string;
  /** Text shown in the middle; defaults to the grade formatted in Italian (8,4). */
  children?: string;
  className?: string;
}

export function ProgressRing({ value, max = 10, tone, size = 88, label, children, className }: ProgressRingProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const resolvedTone = tone ?? gradeTone((value / max) * 10);
  const text = children ?? formatGrade(value);
  return (
    <div
      role="img"
      aria-label={`${label}: ${text} su ${max}`}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="-rotate-90" width={size} height={size}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="9" className="stroke-ink-100" />
        <motion.circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          initial={{ strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 1 - ratio }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className={strokeClasses[resolvedTone]}
        />
      </svg>
      <span aria-hidden="true" className="absolute text-lg font-bold tracking-title text-fg">
        {text}
      </span>
    </div>
  );
}
