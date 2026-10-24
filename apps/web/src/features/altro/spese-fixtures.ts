import { json, page } from "@/test/stub-api";
import type { LedgerEntry, LedgerSummary } from "./types";

const STAMPS = { createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z" };

export const PALLONI: LedgerEntry = {
  id: "l-palloni",
  kind: "EXPENSE",
  category: "Attrezzatura sportiva",
  description: "Palloni da gara",
  supplier: "Volley Shop Emilia",
  notes: "Fattura 118",
  amountCents: 64000,
  occurredOn: "2026-09-18",
  sponsorId: null,
  paymentId: null,
  source: null,
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
};

export const SPESE_SUMMARY: LedgerSummary = {
  totalCents: 80500,
  count: 3,
  manualCents: 76000,
  linkedCents: 4500,
  categories: [
    { category: "Attrezzatura sportiva", totalCents: 76000, count: 2, firstOn: "2026-09-18", lastOn: "2026-10-02", names: ["Palloni da gara", "Reti da gara"] },
    { category: "Arbitri", totalCents: 4500, count: 1, firstOn: "2026-11-14", lastOn: "2026-11-14", names: ["Roberto Cattaneo · Aquile - Delfini"] },
  ],
};

export const EMPTY_SUMMARY: LedgerSummary = { totalCents: 0, count: 0, manualCents: 0, linkedCents: 0, categories: [] };

/** What the summary says about one category, as the API gives it when asked for that category alone. */
export const ATTREZZATURA_SUMMARY: LedgerSummary = {
  totalCents: 76000,
  count: 2,
  manualCents: 76000,
  linkedCents: 0,
  categories: [SPESE_SUMMARY.categories[0] as LedgerSummary["categories"][number]],
};

export const CATEGORIES = ["Arbitri", "Assicurazioni", "Attrezzatura sportiva", "Palestre"];

/** The routes of the Spese pages: the summary (whole or of one category), the categories and the entries of a category. */
export function speseRoutes() {
  return {
    "GET /ledger/summary": (call: { query: URLSearchParams }) => json(200, call.query.get("category") ? ATTREZZATURA_SUMMARY : SPESE_SUMMARY),
    "GET /ledger/categories": () => json(200, { data: CATEGORIES }),
    "GET /ledger/entries": (call: { query: URLSearchParams }) =>
      json(200, page([PALLONI, RETI, ARBITRO].filter((entry) => !call.query.get("category") || entry.category === call.query.get("category")))),
  };
}
