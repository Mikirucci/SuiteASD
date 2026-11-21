import type { LedgerEntry, LedgerSummary, LedgerTrend } from "./types";

const STAMPS = { createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z" };

// The expenses of the demo year: two written by hand and one that a referee's fee produced

export const PALLONI: LedgerEntry = {
  id: "l-palloni",
  kind: "EXPENSE",
  category: "Attrezzatura sportiva",
  description: "Palloni da gara",
  supplier: "Volley Shop Emilia",
  notes: "Fattura 118",
  amountCents: 64000,
  occurredOn: "2026-09-18",
  paymentId: null,
  source: null,
  sourceId: null,
  ...STAMPS,
};

export const RETI: LedgerEntry = { ...PALLONI, id: "l-reti", description: "Reti da gara", supplier: null, notes: null, amountCents: 12000, occurredOn: "2026-10-02" };

export const ARBITRO: LedgerEntry = {
  ...PALLONI,
  id: "l-arbitro",
  category: "Arbitri",
  description: "Roberto Cattaneo · Aquile - Delfini",
  supplier: null,
  notes: null,
  amountCents: 4500,
  occurredOn: "2026-11-14",
  source: "REFEREE",
  sourceId: "ra-1",
};

// The incomes: a sponsor's contract and a fee received, both born in their sections, and one contribution written by hand

export const OTTICA: LedgerEntry = {
  ...PALLONI,
  id: "l-ottica",
  kind: "INCOME",
  category: "Sponsor",
  description: "Ottica Rossi",
  supplier: null,
  notes: null,
  amountCents: 150000,
  occurredOn: "2026-09-01",
  source: "SPONSOR",
  sourceId: "s-ottica",
};

export const QUOTA: LedgerEntry = {
  ...OTTICA,
  id: "l-quota",
  category: "Quote",
  description: "Quota novembre · Anna Ferri",
  amountCents: 24000,
  occurredOn: "2026-11-05",
  paymentId: "pay-1",
  source: "PAYMENT",
  sourceId: "pay-1",
};

export const COMUNE: LedgerEntry = {
  ...PALLONI,
  id: "l-comune",
  kind: "INCOME",
  category: "Contributi",
  description: "Contributo del Comune",
  supplier: "Comune di Bologna",
  notes: null,
  amountCents: 50000,
  occurredOn: "2026-10-02",
};

export const SPESE: readonly LedgerEntry[] = [PALLONI, RETI, ARBITRO];
export const ENTRATE: readonly LedgerEntry[] = [OTTICA, QUOTA, COMUNE];

const total = (entries: readonly LedgerEntry[]): number => entries.reduce((sum, entry) => sum + entry.amountCents, 0);

/** What GET /ledger/summary answers for these entries: computed from them, so the figures of a test cannot disagree. */
export function summaryOf(entries: readonly LedgerEntry[]): LedgerSummary {
  const categories = [...new Set(entries.map((entry) => entry.category))].map((category) => {
    const own = entries.filter((entry) => entry.category === category);
    const days = own.map((entry) => entry.occurredOn).sort();
    const heaviest = [...own].sort((a, b) => b.amountCents - a.amountCents).flatMap((entry) => (entry.description ? [entry.description] : []));
    return { category, totalCents: total(own), count: own.length, firstOn: days[0] as string, lastOn: days.at(-1) as string, names: heaviest.slice(0, 3) };
  });
  return {
    totalCents: total(entries),
    count: entries.length,
    manualCents: total(entries.filter((entry) => !entry.source)),
    linkedCents: total(entries.filter((entry) => entry.source)),
    categories: categories.sort((a, b) => b.totalCents - a.totalCents),
  };
}

/** What GET /ledger/trend answers for the entries of a year: one bucket for each month. */
export function trendOf(entries: readonly LedgerEntry[], year = 2026): LedgerTrend {
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const own = entries.filter((entry) => entry.occurredOn.startsWith(key));
    const incomeCents = total(own.filter((entry) => entry.kind === "INCOME"));
    const expenseCents = total(own.filter((entry) => entry.kind === "EXPENSE"));
    return { key, incomeCents, expenseCents, balanceCents: incomeCents - expenseCents };
  });
  const incomeCents = total(entries.filter((entry) => entry.kind === "INCOME"));
  const expenseCents = total(entries.filter((entry) => entry.kind === "EXPENSE"));
  return { granularity: "MONTH", totals: { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents }, buckets };
}

export const SPESE_SUMMARY = summaryOf(SPESE);
export const ENTRATE_SUMMARY = summaryOf(ENTRATE);
export const EMPTY_SUMMARY: LedgerSummary = { totalCents: 0, count: 0, manualCents: 0, linkedCents: 0, categories: [] };
export const EMPTY_TREND: LedgerTrend = { ...trendOf([]), buckets: [] };

export const CATEGORIES = ["Arbitri", "Assicurazioni", "Attrezzatura sportiva", "Palestre"];
export const INCOME_CATEGORIES = ["Contributi", "Quote", "Sponsor"];
