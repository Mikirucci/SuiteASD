import { Card, ProgressRing } from "@/components/ui";
import type { AutomationDashboard } from "./types";

function describeProgress({ active, total }: AutomationDashboard["summary"]): string {
  if (total > 0 && active === total) return "Tutto sotto controllo: l'app gestisce ogni attività al posto tuo.";
  if (active === 0) return "Nessuna attività è delegata: attivane una e smetti di ricordare scadenze a mano.";
  return "Attiva le altre attività per delegare anche quelle.";
}

/** Share of activities the app handles by itself: active automations over the total. */
export function SummaryCard({ summary }: { summary: AutomationDashboard["summary"] }) {
  return (
    <Card as="section" aria-labelledby="automations-summary-title" className="flex items-center gap-4 sm:gap-6">
      {/* The text beside the ring says the same in words, so the ring is decorative for screen readers */}
      <div aria-hidden="true" className="shrink-0">
        <ProgressRing value={summary.percentage} max={100} tone="brand" size={96} label="Attività gestite dall'app">
          {`${summary.percentage}%`}
        </ProgressRing>
      </div>
      <div className="min-w-0">
        <h2 id="automations-summary-title" className="text-lg font-bold tracking-title text-fg">
          Attività gestite dall&apos;app
        </h2>
        <p className="mt-1 text-sm font-semibold text-fg">
          {summary.active} su {summary.total} attive · {summary.percentage}%
        </p>
        <p className="mt-1 text-sm text-fg-muted">{describeProgress(summary)}</p>
      </div>
    </Card>
  );
}
