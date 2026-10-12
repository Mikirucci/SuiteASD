"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

export type ProgressTone = "brand" | "success" | "gradient";

const fillClasses: Record<ProgressTone, string> = {
  brand: "bg-primary",
  success: "bg-mint-600",
  gradient: "bg-linear-to-r from-brand-500 to-mint-600",
};

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name of the bar, e.g. "Presenze confermate". */
  label: string;
  tone?: ProgressTone;
  /** Text read by screen readers instead of the percentage, e.g. "5 su 12 confermate". */
  valueText?: string;
  className?: string;
}

/** The fill animates by sliding (transform only, so the rounded end stays intact), and honours prefers-reduced-motion via MotionConfig. */
export function ProgressBar({ value, max = 100, label, tone = "brand", valueText, className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-ink-100", className)}
    >
      <motion.div
        className={cn("h-full w-full rounded-full", fillClasses[tone])}
        initial={{ x: "-100%" }}
        animate={{ x: `${(ratio - 1) * 100}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
