"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, Badge, Button, Chip, DataBoundary, Drawer, DrawerContent, EmptyState, type ChipTone } from "@/components/ui";
import { api, describeError, type ApiError } from "@/lib/api";
import { describeResult, formatDateTime, formatDuration, isManualRun, RUN_STATUS_LABELS } from "./format";
import type { Automation, AutomationRun, RunStatus, RunsPage } from "./types";

const PAGE_SIZE = 20;

const STATUS_CHIPS: Record<RunStatus, { tone: ChipTone; icon: ReactNode }> = {
  SUCCESS: { tone: "success", icon: <Check strokeWidth={3} /> },
  FAILED: { tone: "danger", icon: <AlertTriangle /> },
  RUNNING: { tone: "brand", icon: <Clock /> },
};

function RunItem({ run }: { run: AutomationRun }) {
  const { tone, icon } = STATUS_CHIPS[run.status];
  const duration = formatDuration(run.startedAt, run.finishedAt);
  const counters = describeResult(run.result);
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={tone} icon={icon}>
          {RUN_STATUS_LABELS[run.status]}
        </Chip>
        <Badge>{isManualRun(run) ? "Manuale" : "Automatica"}</Badge>
      </div>
      <p className="text-sm font-semibold text-fg">
        <time dateTime={run.startedAt}>{formatDateTime(run.startedAt)}</time>
        {duration ? <span className="font-normal text-fg-muted"> · {duration}</span> : null}
      </p>
      {counters.length > 0 ? (
        <ul className="flex flex-col text-sm text-fg-muted">
          {counters.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {run.error ? (
        <p className="break-words text-sm text-danger">
          Dettaglio tecnico: <span className="font-mono text-xs">{run.error}</span>
        </p>
      ) : null}
    </li>
  );
}

function RunsLog({ automation }: { automation: Automation }) {
  const runs = useInfiniteQuery<RunsPage, ApiError, { pages: RunsPage[] }, string[], string | null>({
    queryKey: ["automation-runs", automation.key],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      api.get<RunsPage>(`/automations/${automation.key}/runs`, { query: { limit: PAGE_SIZE, cursor: pageParam }, signal }),
    getNextPageParam: (last) => (last.page.hasMore ? last.page.nextCursor : undefined),
  });

  const items = runs.data?.pages.flatMap((page) => page.data);
  return (
    <div className="flex flex-col gap-4">
      <DataBoundary
        isLoading={runs.isLoading}
        error={runs.data ? null : runs.error}
        onRetry={() => void runs.refetch()}
        isEmpty={!items || items.length === 0}
        loadingLabel="Caricamento del registro"
        skeletonRows={3}
        empty={
          <EmptyState
            icon={ScrollText}
            title="Nessuna esecuzione registrata"
            description={
              automation.kind === "EVENT"
                ? "Questa attività scatta da sola a ogni evento e non tiene un registro a parte."
                : "Appena l'attività parte, qui trovi data, esito e numeri di ogni esecuzione."
            }
          />
        }
      >
        <ul aria-label={`Esecuzioni di ${automation.name}`} className="flex flex-col">
          {items?.map((run) => <RunItem key={run.id} run={run} />)}
        </ul>
      </DataBoundary>
      {runs.isFetchNextPageError ? <Alert tone="danger">{describeError(runs.error)}</Alert> : null}
      {runs.hasNextPage ? (
        <Button variant="secondary" loading={runs.isFetchingNextPage} onClick={() => void runs.fetchNextPage()}>
          Mostra esecuzioni precedenti
        </Button>
      ) : null}
    </div>
  );
}

export interface RunsDrawerProps {
  automation: Automation | null;
  onClose: () => void;
}

/** Execution log of one automation, newest first. */
export function RunsDrawer({ automation, onClose }: RunsDrawerProps) {
  if (!automation) return null;
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent title="Registro delle esecuzioni" description={automation.name}>
        <RunsLog automation={automation} />
      </DrawerContent>
    </Drawer>
  );
}
