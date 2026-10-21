"use client";

import { BellRing, Send, UserPlus } from "lucide-react";
import { Alert, Button, DataBoundary, useToast } from "@/components/ui";
import { useApiMutation } from "@/lib/api";
import { useEventConvocations, useInvalidateCalendar } from "./api";
import { ConvocationAnswer } from "./convocation-answer";
import { ConvocationGrid } from "./convocation-grid";
import { ConvocationProgress } from "./convocation-progress";
import { closedReason, describeCalendarError, formatShortDateTime, isOpen, pluralize } from "./format";
import type { CalendarAccess } from "./use-calendar-access";
import type { CalendarEvent, Convocation, EventConvocations, RemindConvocationsResult, SendConvocationsResult } from "./types";

export interface ConvocationsPanelProps {
  event: CalendarEvent;
  access: CalendarAccess;
  onConvocate: () => void;
}

/** Squad of an event: progress, the three groups of answers, and the actions of the coach (notify, add, remind). */
export function ConvocationsPanel({ event, access, onConvocate }: ConvocationsPanelProps) {
  const { toast } = useToast();
  const invalidate = useInvalidateCalendar();
  const query = useEventConvocations(event.id);
  const open = isOpen(event);

  const send = useApiMutation(
    (_input: void, client) => client.post<SendConvocationsResult>(`/events/${event.id}/convocations/send`),
    {
      onSuccess: async (result) => {
        await invalidate();
        toast({
          title: result.sent > 0 ? pluralize(result.sent, "atleta avvisato", "atleti avvisati") : "Erano già tutti avvisati",
          description: result.sent > 0 ? "Atleti e genitori hanno ricevuto la notifica." : undefined,
          tone: "success",
        });
      },
    },
  );
  const remind = useApiMutation(
    (_input: void, client) => client.post<RemindConvocationsResult>(`/events/${event.id}/convocations/remind`),
    {
      onSuccess: async (result) => {
        await invalidate();
        toast({
          title: result.reminded > 0 ? pluralize(result.reminded, "promemoria inviato", "promemoria inviati") : "Nessun promemoria da inviare",
          description: result.reminded > 0 ? undefined : "Chi non ha risposto è già stato sollecitato oggi.",
          tone: result.reminded > 0 ? "success" : "info",
        });
      },
    },
  );
  const remove = useApiMutation((target: Convocation, client) => client.delete<void>(`/convocations/${target.id}`), {
    onSuccess: invalidate,
  });

  const actionError = send.error ?? remind.error ?? remove.error;

  return (
    <section aria-labelledby={`convocations-${event.id}`} className="flex flex-col gap-4">
      <h3 id={`convocations-${event.id}`} className="text-base font-bold tracking-title text-fg">
        Convocazioni
      </h3>
      <DataBoundary
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Caricamento delle convocazioni"
        isEmpty={false}
        empty={null}
      >
        {query.data ? (
          <PanelBody
            data={query.data}
            event={event}
            access={access}
            open={open}
            removingId={remove.isPending ? (remove.variables?.id ?? null) : null}
            onRemove={(target) => remove.mutate(target)}
            onConvocate={onConvocate}
            onSend={() => send.mutate()}
            onRemind={() => remind.mutate()}
            sending={send.isPending}
            reminding={remind.isPending}
          />
        ) : null}
      </DataBoundary>
      {actionError ? <Alert tone="danger">{describeCalendarError(actionError)}</Alert> : null}
    </section>
  );
}

interface PanelBodyProps {
  data: EventConvocations;
  event: CalendarEvent;
  access: CalendarAccess;
  open: boolean;
  removingId: string | null;
  onRemove: (target: Convocation) => void;
  onConvocate: () => void;
  onSend: () => void;
  onRemind: () => void;
  sending: boolean;
  reminding: boolean;
}

function PanelBody({ data, event, access, open, removingId, onRemove, onConvocate, onSend, onRemind, sending, reminding }: PanelBodyProps) {
  const rows = data.data;
  const sentAt = rows.flatMap((row) => (row.sentAt ? [row.sentAt] : [])).sort().at(-1);
  const hasUnsent = rows.some((row) => row.sentAt === null);
  const hasPendingSent = rows.some((row) => row.sentAt !== null && row.status === "PENDING");
  const canManage = access.canConvocate && open;
  const staffView = access.canSeeConvocations;
  const closed = closedReason(event);
  const helpId = `notify-help-${event.id}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ConvocationProgress summary={data.summary} label={event.title} />
        {staffView && sentAt ? <p className="text-sm text-fg-muted">Avviso inviato il {formatShortDateTime(sentAt)}</p> : null}
      </div>

      {staffView ? (
        rows.length > 0 ? (
          <ConvocationGrid convocations={rows} onRemove={canManage ? onRemove : undefined} removingId={removingId} idPrefix={`squad-${event.id}`} />
        ) : (
          <p className="text-sm text-fg-muted">Nessun atleta convocato ancora.</p>
        )
      ) : rows.length > 0 ? (
        <div className="flex flex-col gap-4 divide-y divide-line [&>*:not(:first-child)]:pt-4">
          {rows.map((row) => (
            <ConvocationAnswer key={row.id} convocation={row} closed={closed ?? undefined} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-fg-muted">Non hai ancora una convocazione per questo evento: quando arriva la trovi qui.</p>
      )}

      {canManage && !event.team ? (
        <Alert tone="info">Per convocare gli atleti assegna una squadra all&apos;evento con Modifica.</Alert>
      ) : null}
      {canManage ? (
        <div className="flex flex-col gap-3">
          {hasUnsent ? (
            <p id={helpId} className="text-sm text-fg-muted">
              Gli atleti vedono già l&apos;evento e possono rispondere. Questo invia loro una notifica.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {hasUnsent ? (
              <Button leftIcon={<Send />} loading={sending} onClick={onSend} aria-describedby={helpId}>
                Avvisa gli atleti
              </Button>
            ) : null}
            {event.team ? (
              <Button variant="secondary" leftIcon={<UserPlus />} onClick={onConvocate}>
                Convoca atleti
              </Button>
            ) : null}
            {hasPendingSent ? (
              <Button variant="secondary" leftIcon={<BellRing />} loading={reminding} onClick={onRemind}>
                Sollecita chi non ha risposto
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
