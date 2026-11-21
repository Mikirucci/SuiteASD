import type { LedgerSummaryDto } from './schema.js';

export interface SummaryEntry {
  category: string;
  amountCents: number;
  /** True when another module owns the entry (a payment, or the cost of a venue, kit, trip or referee) */
  linked: boolean;
  description: string | null;
  /** "YYYY-MM-DD" */
  occurredOn: string;
}

const NAMES_SHOWN = 3;

interface CategoryAccumulator {
  category: string;
  totalCents: number;
  count: number;
  firstOn: string;
  lastOn: string;
  named: Map<string, number>;
}

// Pure aggregation of the entries of one kind in a period: the total, how much was entered by hand and how much comes
// from other sections, and a row per category (the heaviest first) with its dates and its biggest expenses by name.
export function buildLedgerSummary(entries: readonly SummaryEntry[]): LedgerSummaryDto {
  let totalCents = 0;
  let linkedCents = 0;
  const categories = new Map<string, CategoryAccumulator>();

  for (const entry of entries) {
    totalCents += entry.amountCents;
    if (entry.linked) linkedCents += entry.amountCents;
    const row = categories.get(entry.category) ?? {
      category: entry.category,
      totalCents: 0,
      count: 0,
      firstOn: entry.occurredOn,
      lastOn: entry.occurredOn,
      named: new Map<string, number>(),
    };
    row.totalCents += entry.amountCents;
    row.count += 1;
    if (entry.occurredOn < row.firstOn) row.firstOn = entry.occurredOn;
    if (entry.occurredOn > row.lastOn) row.lastOn = entry.occurredOn;
    if (entry.description) row.named.set(entry.description, (row.named.get(entry.description) ?? 0) + entry.amountCents);
    categories.set(entry.category, row);
  }

  return {
    totalCents,
    count: entries.length,
    manualCents: totalCents - linkedCents,
    linkedCents,
    categories: [...categories.values()]
      .sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category, 'it'))
      .map(({ named, ...row }) => ({
        ...row,
        names: [...named.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'))
          .slice(0, NAMES_SHOWN)
          .map(([name]) => name),
      })),
  };
}
