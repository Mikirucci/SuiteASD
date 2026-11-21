import { json, page } from "@/test/stub-api";
import { CATEGORIES, ENTRATE, INCOME_CATEGORIES, SPESE, summaryOf, trendOf } from "./ledger-data";

// The data of these tests lives in ledger-data, which the end-to-end tests read too: they cannot load this file
export * from "./ledger-data";

/**
 * The routes of the pages of the movements: the summary of the incomes or of the expenses (whole or of one category),
 * how they follow one another, the categories to offer and the entries of a category.
 */
export function ledgerRoutes() {
  const ofKind = (call: { query: URLSearchParams }) => (call.query.get("kind") === "INCOME" ? ENTRATE : SPESE);
  const ofCategory = (call: { query: URLSearchParams }) => ofKind(call).filter((entry) => !call.query.get("category") || entry.category === call.query.get("category"));
  return {
    "GET /ledger/summary": (call: { query: URLSearchParams }) => json(200, summaryOf(ofCategory(call))),
    "GET /ledger/trend": () => json(200, trendOf([...ENTRATE, ...SPESE])),
    "GET /ledger/categories": (call: { query: URLSearchParams }) => json(200, { data: call.query.get("kind") === "INCOME" ? INCOME_CATEGORIES : CATEGORIES }),
    "GET /ledger/entries": (call: { query: URLSearchParams }) => json(200, page([...ofCategory(call)])),
  };
}
