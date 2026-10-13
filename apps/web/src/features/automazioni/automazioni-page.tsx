"use client";

import { Lock, Zap } from "lucide-react";
import { useState } from "react";
import { Card, DataBoundary, EmptyState, Reveal, SectionHeading, Skeleton } from "@/components/ui";
import { useApiQuery } from "@/lib/api";
import { AutomationRow } from "./automation-row";
import { ConfigDialog } from "./config-dialog";
import { RunsDrawer } from "./runs-drawer";
import { SummaryCard } from "./summary-card";
import type { Automation, AutomationDashboard } from "./types";
import { useAutomationsAccess } from "./use-automations-access";

function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento delle attività" className="flex flex-col gap-6">
      <Skeleton className="h-32 rounded-lg" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Module 08: the activities the app handles by itself, with their state, settings and execution log. */
export function AutomazioniPage() {
  const { canRead, canWrite } = useAutomationsAccess();
  const [configuring, setConfiguring] = useState<Automation | null>(null);
  const [viewingRuns, setViewingRuns] = useState<Automation | null>(null);
  const dashboard = useApiQuery<AutomationDashboard>(["automations"], "/automations", { enabled: canRead });

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        index={8}
        label="Gestione delegata"
        title="Tu pensi alla squadra. Al resto, l'app."
        highlight="l'app."
        description="Promemoria, convocazioni, ricevute e avvisi partono da soli. Qui vedi cosa fa l'app per te, cambi le soglie e controlli ogni esecuzione."
      />
      {canRead ? (
        <DataBoundary
          isLoading={dashboard.isLoading}
          error={dashboard.error}
          onRetry={() => void dashboard.refetch()}
          isEmpty={!dashboard.data || dashboard.data.data.length === 0}
          skeleton={<DashboardSkeleton />}
          empty={
            <EmptyState
              icon={Zap}
              title="Nessuna attività da mostrare"
              description="Le attività gestite dall'app compaiono qui appena la società è configurata."
            />
          }
        >
          {dashboard.data ? (
            <div className="flex flex-col gap-6">
              <SummaryCard summary={dashboard.data.summary} />
              <section className="flex flex-col gap-3">
                <h2 id="automations-checklist-title" className="text-lg font-bold tracking-title text-fg">
                  Checklist delle attività
                </h2>
                <ul aria-labelledby="automations-checklist-title" className="flex flex-col gap-2">
                  {dashboard.data.data.map((automation, index) => (
                    <li key={automation.key}>
                      <Reveal index={index}>
                        <Card padding="none">
                          <AutomationRow
                            automation={automation}
                            canWrite={canWrite}
                            onConfigure={setConfiguring}
                            onShowRuns={setViewingRuns}
                          />
                        </Card>
                      </Reveal>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </DataBoundary>
      ) : (
        <EmptyState
          icon={Lock}
          title="Sezione riservata"
          description="Le attività gestite dall'app sono visibili ad amministratori e segreteria."
        />
      )}
      <ConfigDialog automation={configuring} onClose={() => setConfiguring(null)} />
      <RunsDrawer automation={viewingRuns} onClose={() => setViewingRuns(null)} />
    </div>
  );
}
