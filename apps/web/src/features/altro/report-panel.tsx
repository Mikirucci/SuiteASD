"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Card, Checkbox, DataBoundary, EmptyState, Input, useToast } from "@/components/ui";
import { api, describeError, useApiMutation, useApiQuery } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { formatEuro, pluralize } from "@/lib/format";
import { saveFile } from "@/lib/save-file";

type ReportSection = "LEDGER" | "FEES" | "SPONSORS" | "TRIPS" | "REFEREES";

interface ReportSummary {
  period: { from: string; to: string };
  sections: Array<{ section: ReportSection; records: number; amountCents: number }>;
}

const SECTION_INFO: Record<ReportSection, { label: string; amountLabel: string }> = {
  LEDGER: { label: "Bilancio", amountLabel: "saldo" },
  FEES: { label: "Quote e incassi", amountLabel: "incassato" },
  SPONSORS: { label: "Sponsor", amountLabel: "contratti" },
  TRIPS: { label: "Trasferte", amountLabel: "costi" },
  REFEREES: { label: "Arbitri", amountLabel: "compensi" },
};

const ALL_SECTIONS = Object.keys(SECTION_INFO) as ReportSection[];

interface DownloadInput {
  from: string;
  to: string;
  sections: readonly ReportSection[];
}

function useDownloadReport() {
  return useApiMutation(async ({ from, to, sections }: DownloadInput) => {
    const file = await api.download("/reports/accounting.pdf", { query: { from, to, sections: sections.join(",") } });
    saveFile(file, `report-${from}_${to}.pdf`);
  });
}

export interface ReportPanelProps {
  /** Year shown by the page: the period starts as the whole year (until today for the current one). */
  year: number;
}

function defaultPeriod(year: number): { from: string; to: string } {
  const today = new Date();
  const to = year === today.getFullYear() ? toDayKey(today) : `${year}-12-31`;
  return { from: `${year}-01-01`, to };
}

/** PDF report for the accountant: the whole thing, or one section at a time, for a period. */
export function ReportPanel({ year }: ReportPanelProps) {
  const { toast } = useToast();
  const [period, setPeriod] = useState(() => defaultPeriod(year));
  const [chosen, setChosen] = useState<ReadonlySet<ReportSection>>(() => new Set(ALL_SECTIONS));
  const [shownYear, setShownYear] = useState(year);
  // A new year on the page restarts the period from that year
  if (shownYear !== year) {
    setShownYear(year);
    setPeriod(defaultPeriod(year));
  }

  const validPeriod = period.from !== "" && period.to !== "" && period.from <= period.to;
  const summary = useApiQuery<ReportSummary>(["reports", "summary", period], "/reports/accounting/summary", {
    query: period,
    enabled: validPeriod,
  });
  const download = useDownloadReport();
  // Which button started the download, so only that one shows the spinner
  const [busy, setBusy] = useState<"all" | ReportSection | null>(null);

  const toggle = (section: ReportSection, checked: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (checked) next.add(section);
      else next.delete(section);
      return next;
    });

  const save = (sections: readonly ReportSection[], key: "all" | ReportSection) => {
    setBusy(key);
    download.mutate(
      { ...period, sections },
      {
        onError: (error) => toast({ title: "Report non generato", description: describeError(error), tone: "danger" }),
        onSettled: () => setBusy(null),
      },
    );
  };

  const rows = summary.data?.sections ?? [];
  const selected = ALL_SECTIONS.filter((section) => chosen.has(section));
  const allSelected = selected.length === ALL_SECTIONS.length;

  return (
    <section aria-labelledby="report-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="report-title" className="text-lg font-bold tracking-title text-fg">
          Report per il commercialista
        </h2>
        <p className="max-w-prose text-sm text-fg-muted">
          Un PDF pronto da consegnare: tutto insieme oppure una sezione alla volta, per il periodo che scegli.
        </p>
      </div>

      <Card className="flex flex-col gap-6">
        <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
          <Input
            label="Dal"
            type="date"
            value={period.from}
            max={period.to || undefined}
            onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))}
          />
          <Input
            label="Al"
            type="date"
            value={period.to}
            min={period.from || undefined}
            onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
          />
        </div>

        {!validPeriod ? (
          <Alert tone="danger">Scegli un periodo valido: la data di inizio non può essere dopo quella di fine.</Alert>
        ) : (
          <DataBoundary
            isLoading={summary.isLoading}
            error={summary.error}
            onRetry={() => void summary.refetch()}
            isEmpty={rows.length === 0}
            loadingLabel="Calcolo del contenuto del report"
            skeletonRows={5}
            empty={<EmptyState icon={FileText} title="Niente da esportare" description="Per questo periodo non ci sono dati." />}
          >
            <ul aria-label="Sezioni del report" className="divide-y divide-line">
              {rows.map((row) => {
                const info = SECTION_INFO[row.section];
                return (
                  <li key={row.section} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1 first:pt-0 last:pb-0">
                    <Checkbox
                      label={info.label}
                      checked={chosen.has(row.section)}
                      onChange={(event) => toggle(row.section, event.target.checked)}
                      className="min-w-40"
                    />
                    <p className="min-w-0 flex-1 text-sm text-fg-muted">
                      {row.records === 0
                        ? "Nessuna voce nel periodo"
                        : `${pluralize(row.records, "voce", "voci")} · ${info.amountLabel} ${formatEuro(row.amountCents)}`}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Download />}
                      aria-label={`Scarica solo ${info.label}`}
                      loading={busy === row.section}
                      onClick={() => save([row.section], row.section)}
                    >
                      Solo questa
                    </Button>
                  </li>
                );
              })}
            </ul>
          </DataBoundary>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            leftIcon={<Download />}
            disabled={!validPeriod || selected.length === 0}
            loading={busy === "all"}
            onClick={() => save(selected, "all")}
          >
            {allSelected ? "Scarica il report completo" : "Scarica le sezioni scelte"}
          </Button>
          {selected.length === 0 ? <p className="text-sm text-fg-muted">Scegli almeno una sezione.</p> : null}
        </div>
      </Card>
    </section>
  );
}
