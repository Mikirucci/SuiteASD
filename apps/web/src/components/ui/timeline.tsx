"use client";

import { useEffect, useRef, useState } from "react";
import { initialsOf } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { assignLanes } from "./timeline-lanes";

export interface TimelineItem {
  id: string;
  name: string;
  /** Expiry date. Items outside the visible range are not drawn. */
  date: Date;
}

export interface TimelineProps {
  /** First day of the first visible month. */
  start: Date;
  /** Number of months shown (the video shows OTT to MAR: 6). */
  months?: number;
  items: readonly TimelineItem[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Describes the timeline, e.g. "Scadenze dei certificati medici". */
  label: string;
  className?: string;
}

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("it-IT", { month: "short" });

/** Height of one row of avatars: a 44px touch target (the avatar itself is 40px). */
const LANE_HEIGHT = 44;
const MAX_LANES = 4;

/** Width of an element in pixels, kept up to date on resize (0 until measured, e.g. in jsdom). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Horizontal month axis with a person's avatar placed at their expiry date. Avatars that would overlap
 * are moved to extra rows, and below 544px wide the axis scrolls instead of squeezing the months.
 */
export function Timeline({ start, months = 6, items, selectedId, onSelect, label, className }: TimelineProps) {
  const rangeStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + months, 1);
  const span = rangeEnd.getTime() - rangeStart.getTime();

  const visible = items
    .filter((item) => item.date >= rangeStart && item.date < rangeEnd)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const [trackRef, trackWidth] = useElementWidth<HTMLOListElement>();
  const percentOf = (item: TimelineItem) => ((item.date.getTime() - rangeStart.getTime()) / span) * 100;
  // Until the track is measured, every avatar stays on the first row (no layout jump on first paint)
  const lanes =
    trackWidth === 0
      ? visible.map(() => 0)
      : assignLanes(
          visible.map((item) => (percentOf(item) / 100) * trackWidth),
          LANE_HEIGHT,
          MAX_LANES,
        );
  const laneCount = Math.max(1, ...lanes.map((lane) => lane + 1));

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div className="min-w-136 px-5">
        <ol ref={trackRef} aria-label={label} className="relative" style={{ height: laneCount * LANE_HEIGHT + 4 }}>
          {visible.map((item, index) => {
            const position = percentOf(item);
            const description = `${item.name}, scade il ${dateFormat.format(item.date)}`;
            const selected = item.id === selectedId;
            return (
              <li
                key={item.id}
                className="absolute -translate-x-1/2"
                style={{ left: `${position}%`, top: (lanes[index] ?? 0) * LANE_HEIGHT }}
              >
                {onSelect ? (
                  <button
                    type="button"
                    // The visible initials must be part of the accessible name (WCAG 2.5.3)
                    aria-label={`${initialsOf(item.name)} ${description}`}
                    aria-pressed={selected}
                    onClick={() => onSelect(item.id)}
                    className="touch-target rounded-full transition-transform duration-150 ease-soft hover:scale-105"
                  >
                    <Avatar name={item.name} size="md" decorative highlighted={selected} />
                  </button>
                ) : (
                  <>
                    <Avatar name={item.name} size="md" decorative />
                    <span className="sr-only">{description}</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <div aria-hidden="true" className="relative mt-3 h-1 rounded-full bg-primary" />
        <div aria-hidden="true" className="relative mt-2 h-4">
          {Array.from({ length: months }, (_, index) => {
            const month = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + index, 1);
            return (
              <span
                key={month.getTime()}
                className="absolute -translate-x-1/2 text-xs font-semibold uppercase tracking-label text-fg-muted"
                style={{ left: `${((index + 0.5) / months) * 100}%` }}
              >
                {monthFormat.format(month).replace(".", "")}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
