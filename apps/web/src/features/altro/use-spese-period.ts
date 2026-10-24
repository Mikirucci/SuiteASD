"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { defaultRange, isDefaultRange, parseRange, rangeSearch, type DayRange } from "./spese-period";

/** An address of the Spese section that carries the period, so going back or sharing the link keeps it. */
export function periodHref(path: string, range: DayRange): string {
  const search = rangeSearch(range, new Date());
  return search ? `${path}?${search}` : path;
}

export interface SpesePeriod {
  range: DayRange;
  setRange: (range: DayRange) => void;
  /** Back to the current year. */
  reset: () => void;
  /** True when the period is not the one the page opens on. */
  changed: boolean;
}

/** The period of the page, kept in the address (\`?dal=2026-10-01&al=2026-10-31\`) so the list and the page of a category agree on it. */
export function useSpesePeriod(): SpesePeriod {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const from = params.get("dal");
  const to = params.get("al");
  const range = useMemo(() => parseRange(from, to, new Date()), [from, to]);

  const setRange = (next: DayRange) => router.replace(periodHref(pathname, next), { scroll: false });
  return { range, setRange, reset: () => setRange(defaultRange(new Date())), changed: !isDefaultRange(range, new Date()) };
}
