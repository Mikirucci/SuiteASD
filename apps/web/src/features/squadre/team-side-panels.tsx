"use client";

import { AlertTriangle } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Alert, Button, ButtonLink, Card, Skeleton } from "@/components/ui";
import { EVENT_TYPE_LABELS } from "@/features/calendario/format";
import { describeError } from "@/lib/api";
import { formatEuro } from "@/lib/format";
import { useTeamAppointments, useTeamFeesSummary } from "./api";
import { formatEventStart } from "./team-format";

function Panel({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  const headingId = useId();
  return (
    <Card as="section" aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-base font-bold tracking-title text-fg">
        {title}
      </h2>
      {children}
      <div>{footer}</div>
    </Card>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}

function PanelError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Alert tone="danger">{describeError(error)}</Alert>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Riprova
      </Button>
    </div>
  );
}

/** Up to five scheduled events of the team, soonest first. */
export function TeamAppointments({ teamId }: { teamId: string }) {
  const query = useTeamAppointments(teamId, true);
  const events = query.data?.data ?? [];
  return (
    <Panel
      title="Prossimi appuntamenti"
      footer={
        <ButtonLink href="/calendario" variant="secondary" size="sm">
          Apri il calendario
        </ButtonLink>
      }
    >
      {query.isPending ? (
        <PanelSkeleton label="Caricamento degli appuntamenti" />
      ) : query.error ? (
        <PanelError error={query.error} onRetry={() => void query.refetch()} />
      ) : events.length === 0 ? (
        <p className="text-sm text-fg-muted">Nessun appuntamento in programma</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-bold text-fg">{formatEventStart(event.startsAt)}</p>
              <p className="break-words text-sm text-fg">{event.title}</p>
              <p className="break-words text-xs text-fg-muted">
                {[EVENT_TYPE_LABELS[event.type], event.venue?.name].filter(Boolean).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Collected and still to collect for the members of the team. */
export function TeamFees({ teamId }: { teamId: string }) {
  const query = useTeamFeesSummary(teamId, true);
  const summary = query.data;
  const hasFees = summary ? summary.paidCount + summary.pendingCount + summary.overdueCount > 0 : false;
  return (
    <Panel
      title="Quote della squadra"
      footer={
        <ButtonLink href="/quote" variant="secondary" size="sm">
          Apri le quote
        </ButtonLink>
      }
    >
      {query.isPending ? (
        <PanelSkeleton label="Caricamento delle quote" />
      ) : query.error ? (
        <PanelError error={query.error} onRetry={() => void query.refetch()} />
      ) : summary && hasFees ? (
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs font-semibold text-fg-muted">Incassato</dt>
            <dd className="mt-0.5 text-xl font-extrabold tracking-title text-success">
              {formatEuro(summary.incassatoCents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-muted">Da incassare</dt>
            <dd className="mt-0.5 text-xl font-extrabold tracking-title text-fg">
              {formatEuro(summary.daIncassareCents)}
            </dd>
            {summary.scadutoCents > 0 ? (
              <dd className="mt-1 flex items-center gap-1 text-xs font-semibold text-danger">
                <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                di cui scaduto {formatEuro(summary.scadutoCents)}
              </dd>
            ) : null}
          </div>
        </dl>
      ) : (
        <p className="text-sm text-fg-muted">Nessuna quota per questa squadra</p>
      )}
    </Panel>
  );
}
