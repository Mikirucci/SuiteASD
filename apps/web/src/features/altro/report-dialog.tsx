"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Checkbox, DataBoundary, Dialog, DialogClose, DialogContent, EmptyState, useToast } from "@/components/ui";
import { api, describeError, useApiMutation, useApiQuery } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { saveFile } from "@/lib/save-file";
import { formatPeriod, lengthInDays, rangeQuery, type DayRange } from "./period";

type ReportSection = "LEDGER" | "INCOME" | "EXPENSES" | "FEES" | "SPONSORS" | "TRIPS" | "REFEREES";

interface ReportSummary {
  period: { from: string; to: string };
  sections: Array<{ section: ReportSection; records: number; amountCents: number }>;
}

const SECTION_INFO: Record<ReportSection, { label: string; amountLabel: string }> = {
  LEDGER: { label: "Bilancio", amountLabel: "saldo" },
  INCOME: { label: "Entrate", amountLabel: "entrate" },
  EXPENSES: { label: "Uscite", amountLabel: "uscite" },
  FEES: { label: "Quote e incassi", amountLabel: "incassato" },
  SPONSORS: { label: "Sponsor", amountLabel: "contratti" },
  TRIPS: { label: "Trasferte", amountLabel: "costi" },
  REFEREES: { label: "Arbitri", amountLabel: "compensi" },
};

const ALL_SECTIONS = Object.keys(SECTION_INFO) as ReportSection[];

/** The API refuses a longer period (docs/api/openapi.yaml). */
const MAX_REPORT_DAYS = 366 * 5;

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

export interface ReportDialogProps {
  /** The period of the page: the report covers exactly what the page shows. */
  range: DayRange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** PDF report for the accountant: the whole thing, or one section at a time, for the period of the page. */
export function ReportDialog({ range, open, onOpenChange }: ReportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ReportBody range={range} />
    </Dialog>
  );
}

function ReportBody({ range }: { range: DayRange }) {
  const { toast } = useToast();
  const period = rangeQuery(range);
  const [chosen, setChosen] = useState<ReadonlySet<ReportSection>>(() => new Set(ALL_SECTIONS));
  // Which button started the download, so only that one shows the spinner
  const [busy, setBusy] = useState<"all" | ReportSection | null>(null);

  const tooLong = lengthInDays(range) > MAX_REPORT_DAYS;
  const summary = useApiQuery<ReportSummary>(["reports", "summary", period], "/reports/accounting/summary", { query: period, enabled: !tooLong });
  const download = useDownloadReport();

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
    <DialogContent
      className="max-w-xl"
      title="Report per il commercialista"
      description={`Un PDF pronto da consegnare per ${formatPeriod(range)}: tutto insieme oppure una sezione alla volta.`}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Chiudi</Button>
          </DialogClose>
          <Button leftIcon={<Download />} disabled={tooLong || selected.length === 0} loading={busy === "all"} onClick={() => save(selected, "all")}>
            {allSelected ? "Scarica il report completo" : "Scarica le sezioni scelte"}
          </Button>
        </>
      }
    >
      {tooLong ? (
        <Alert tone="danger">Il report copre al massimo cinque anni: scegli un periodo più breve.</Alert>
      ) : (
        <DataBoundary
          isLoading={summary.isLoading}
          error={summary.error}
          onRetry={() => void summary.refetch()}
          isEmpty={rows.length === 0}
          loadingLabel="Calcolo del contenuto del report"
          skeletonRows={6}
          empty={<EmptyState icon={FileText} title="Niente da esportare" description="Per questo periodo non ci sono dati." />}
        >
          <ul aria-label="Sezioni del report" className="divide-y divide-line">
            {rows.map((row) => {
              const info = SECTION_INFO[row.section];
              return (
                <li key={row.section} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
                  <Checkbox label={info.label} checked={chosen.has(row.section)} onChange={(event) => toggle(row.section, event.target.checked)} className="min-w-40" />
                  <p className="min-w-0 flex-1 text-sm text-fg-muted">
                    {row.records === 0 ? "Nessuna voce nel periodo" : `${pluralize(row.records, "voce", "voci")} · ${info.amountLabel} ${formatEuro(row.amountCents)}`}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download />}
                    aria-label={`Solo questa: ${info.label}`}
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
      {selected.length === 0 ? <p className="mt-3 text-sm text-fg-muted">Scegli almeno una sezione.</p> : null}
    </DialogContent>
  );
}
