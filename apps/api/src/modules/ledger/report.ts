import type { LedgerKind } from '../../shared/enums.js';
import type { LedgerReportDto } from './schema.js';

export interface ReportEntry {
  kind: LedgerKind;
  category: string;
  amountCents: number;
  occurredOn: Date;
}

interface Totals {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

function emptyTotals(): Totals {
  return { incomeCents: 0, expenseCents: 0, balanceCents: 0 };
}

function add(totals: Totals, kind: LedgerKind, amountCents: number): void {
  if (kind === 'INCOME') {
    totals.incomeCents += amountCents;
    totals.balanceCents += amountCents;
  } else {
    totals.expenseCents += amountCents;
    totals.balanceCents -= amountCents;
  }
}

// Pure aggregation of the entries of one calendar year (UTC) into yearly totals, a row per month and per category.
export function buildLedgerReport(year: number, entries: readonly ReportEntry[]): LedgerReportDto {
  const totals = emptyTotals();
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, '0')}`,
    ...emptyTotals(),
  }));
  const categories = new Map<string, { kind: LedgerKind; category: string; totalCents: number }>();

  for (const entry of entries) {
    add(totals, entry.kind, entry.amountCents);
    const month = months[entry.occurredOn.getUTCMonth()];
    if (month) add(month, entry.kind, entry.amountCents);

    const key = `${entry.kind}:${entry.category}`;
    const row = categories.get(key) ?? { kind: entry.kind, category: entry.category, totalCents: 0 };
    row.totalCents += entry.amountCents;
    categories.set(key, row);
  }

  const sorted = [...categories.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || b.totalCents - a.totalCents || a.category.localeCompare(b.category),
  );
  return { year, totals, months, categories: sorted };
}
