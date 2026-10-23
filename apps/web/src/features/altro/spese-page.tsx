"use client";

import { Coins, CalendarDays, Tag } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Select, Skeleton, StatTile } from "@/components/ui";
import { describeError, useApiQuery } from "@/lib/api";
import { formatEuro } from "@/lib/format";
import { ResourceView } from "./crud/resource-view";
import { CategoryList } from "./ledger-summary";
import { PageShell } from "./page-shell";
import { expensesConfig } from "./resources/expenses";
import type { LedgerReport } from "./types";

const YEARS_SHOWN = 5;

const monthName = new Intl.DateTimeFormat("it-IT", { month: "long" });

/** What was spent in the year, this month and under the heaviest category, then every category with its share. */
function ExpensesSummary({ year, report }: { year: number; report: LedgerReport }) {
  const now = new Date();
  const thisMonth = year === now.getFullYear() ? report.months[now.getMonth()] : undefined;
  const top = report.categories.find((category) => category.kind === "EXPENSE");
  return (
    <section aria-labelledby="expenses-summary-title" className="flex flex-col gap-6">
      <h2 id="expenses-summary-title" className="text-lg font-bold tracking-title text-fg">
        Riepilogo delle spese {year}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={`Spese ${year}`} icon={Coins} value={formatEuro(report.totals.expenseCents)} />
        {thisMonth ? (
          <StatTile label={`In ${monthName.format(now)}`} icon={CalendarDays} value={formatEuro(thisMonth.expenseCents)} />
        ) : null}
        {top ? <StatTile label="Categoria più pesante" icon={Tag} value={formatEuro(top.totalCents)} note={top.category} /> : null}
      </div>
      <CategoryList title="Spese per categoria" kind="EXPENSE" report={report} />
    </section>
  );
}

/** Spese: the extra costs of the club, written once and counted in the balance, next to the ones other sections book. */
export function SpesePage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [category, setCategory] = useState("");

  const report = useApiQuery<LedgerReport>(["ledger", "report", year], "/ledger/report", { query: { year } });
  const categories = useApiQuery<{ data: string[] }>(["ledger", "categories", "EXPENSE"], "/ledger/categories", { query: { kind: "EXPENSE" } });

  const yearOptions = Array.from({ length: YEARS_SHOWN }, (_, index) => {
    const value = String(currentYear - index);
    return { value, label: value };
  });
  const usedCategories = new Set((report.data?.categories ?? []).filter((row) => row.kind === "EXPENSE").map((row) => row.category));
  const categoryOptions = (categories.data?.data ?? []).filter((name) => usedCategories.has(name));

  return (
    <PageShell
      label="Spese"
      title="Ogni spesa, al suo posto."
      highlight="al suo posto."
      description="Palloni, iscrizioni, assicurazioni e ogni altra spesa: le registri una volta e finiscono nel bilancio, insieme ai costi di palestre, divise, trasferte e arbitri."
    >
      <div className="flex flex-col gap-6">
        <Select
          label="Anno"
          className="max-w-40"
          options={yearOptions}
          value={String(year)}
          onChange={(event) => {
            setYear(Number(event.target.value));
            setCategory("");
          }}
        />
        {report.isLoading ? <Skeleton role="status" aria-busy="true" aria-label="Caricamento del riepilogo" className="h-40 rounded-lg" /> : null}
        {report.error ? (
          <Alert tone="danger" title="Riepilogo non disponibile">
            <p>{describeError(report.error)}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void report.refetch()}>
              Riprova
            </Button>
          </Alert>
        ) : null}
        {report.data ? <ExpensesSummary year={year} report={report.data} /> : null}
        <ResourceView
          config={expensesConfig}
          extraQuery={{ kind: "EXPENSE", from: `${year}-01-01`, to: `${year}-12-31`, category: category || undefined }}
          extraFiltersActive={category !== ""}
          onResetExtraFilters={() => setCategory("")}
          toolbarExtra={
            categoryOptions.length > 0 ? (
              <Select
                label="Categoria"
                className="max-w-xs"
                options={[{ value: "", label: "Tutte le categorie" }, ...categoryOptions.map((name) => ({ value: name, label: name }))]}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            ) : undefined
          }
        />
      </div>
    </PageShell>
  );
}
