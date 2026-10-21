"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Alert, Button, Card, Skeleton } from "@/components/ui";
import { EVENT_TYPE_LABELS } from "@/features/calendario/format";
import { describeError } from "@/lib/api";
import { formatEuro } from "@/lib/format";
import { useTeamAppointments, useTeamFeesSummary } from "./api";
import { formatEventStart } from "./team-format";

/** The way out of a panel: a quiet text link, not a button, so that the panels stay light. */
function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="touch-target group inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 ease-soft group-hover:translate-x-0.5" />
    </Link>
  );
}

function Panel({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  const headingId = useId();
  return (
    <Card as="section" aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-base font-bold tracking-title text-fg">
        {title}
      </h2>
      {children}
      <div className="mt-auto">{footer}</div>
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

/** The next three scheduled events of the team from now on, soonest first. */
export function TeamAppointments({ teamId }: { teamId: string }) {
  const query = useTeamAppointments(teamId, true);
  const events = query.data?.data ?? [];
  return (
    <Panel
      title="Prossimi appuntamenti"
      footer={<PanelLink href="/calendario">Vedi tutti gli appuntamenti</PanelLink>}
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
            <li key={event.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
              <p className="truncate text-sm text-fg">
                <span className="font-bold">{formatEventStart(event.startsAt)}</span> {event.title}
              </p>
              <p className="truncate text-xs text-fg-muted">
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
      footer={<PanelLink href="/quote">Apri le quote</PanelLink>}
    >
      {query.isPending ? (
        <PanelSkeleton label="Caricamento delle quote" />
      ) : query.error ? (
        <PanelError error={query.error} onRetry={() => void query.refetch()} />
      ) : summary && hasFees ? (
        <dl className="divide-y divide-line">
          <div className="pb-3">
            <dt className="text-sm font-semibold text-fg-muted">Incassato</dt>
            <dd className="mt-1 text-2xl font-extrabold tracking-title text-success">{formatEuro(summary.incassatoCents)}</dd>
          </div>
          <div className="pt-3">
            <dt className="text-sm font-semibold text-fg-muted">Da incassare</dt>
            <dd className="mt-1 text-2xl font-extrabold tracking-title text-fg">{formatEuro(summary.daIncassareCents)}</dd>
            {summary.scadutoCents > 0 ? (
              <dd className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-danger">
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
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
