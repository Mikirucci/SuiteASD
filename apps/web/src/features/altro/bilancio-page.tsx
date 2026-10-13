"use client";

import { useState } from "react";
import { Select } from "@/components/ui";
import { useApiQuery } from "@/lib/api";
import { ResourceView } from "./crud/resource-view";
import { LedgerSummary } from "./ledger-summary";
import { PageShell } from "./page-shell";
import { ledgerConfig } from "./resources/ledger";
import type { LedgerReport } from "./types";

const YEARS_SHOWN = 5;

/** Bilancio: totals of the chosen year, then the entries of that year with the create/edit/delete flow. */
export function BilancioPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [category, setCategory] = useState("");

  const report = useApiQuery<LedgerReport>(["ledger", "report", year], "/ledger/report", { query: { year } });
  const categories = [...new Set((report.data?.categories ?? []).map((row) => row.category))].sort((a, b) => a.localeCompare(b, "it"));

  const yearOptions = Array.from({ length: YEARS_SHOWN }, (_, index) => {
    const value = String(currentYear - index);
    return { value, label: value };
  });

  return (
    <PageShell
      label="Bilancio"
      title="Entrate e uscite, chiare."
      highlight="chiare."
      description="Registra i movimenti della società e guarda i totali dell'anno, divisi per categoria."
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
        <LedgerSummary year={year} report={report.data} isLoading={report.isLoading} error={report.error} onRetry={() => void report.refetch()} />
        <ResourceView
          config={ledgerConfig}
          extraQuery={{ from: `${year}-01-01`, to: `${year}-12-31`, category: category || undefined }}
          extraFiltersActive={category !== ""}
          onResetExtraFilters={() => setCategory("")}
          toolbarExtra={
            categories.length > 0 ? (
              <Select
                label="Categoria"
                className="max-w-xs"
                options={[{ value: "", label: "Tutte le categorie" }, ...categories.map((name) => ({ value: name, label: name }))]}
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
