"use client";

import { Alert, ButtonLink, Dialog, DialogContent } from "@/components/ui";
import { ConvocationAnswer } from "@/features/calendario/convocation-answer";
import { EventStatusChip, EventTypeIcon } from "@/features/calendario/event-card";
import { EventFacts } from "@/features/calendario/event-facts";
import { closedReason, EVENT_TYPE_LABELS, formatWhen } from "@/features/calendario/format";
import type { AppointmentRow } from "./personal-home-model";

/** What the person can do about the event: answer, read the answer once it is closed, or why there is nothing to answer. */
function AnswerArea({ row }: { row: AppointmentRow }) {
  const closed = closedReason(row.event);
  if (row.convocation) return <ConvocationAnswer convocation={row.convocation} closed={closed ?? undefined} />;
  if (closed === "cancelled") return <Alert tone="info">Evento annullato: non c&apos;è più nulla a cui rispondere.</Alert>;
  if (row.notConvocable) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert tone="info">Non sei convocabile: controlla i documenti</Alert>
        <ButtonLink href="/area-personale/documenti" variant="secondary">
          Apri documenti
        </ButtonLink>
      </div>
    );
  }
  if (row.subject === null) return <p className="text-sm text-fg-muted">Per questo evento non serve rispondere.</p>;
  return <p className="text-sm text-fg-muted">Non hai una convocazione per questo evento.</p>;
}

export interface AppointmentDialogProps {
  row: AppointmentRow | null;
  onClose: () => void;
}

/** One appointment of the home: the event, and the buttons to say whether you come, for as long as the event has not started. */
export function AppointmentDialog({ row, onClose }: AppointmentDialogProps) {
  if (!row) return null;
  const { event } = row;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" title={event.title} description={formatWhen(event)}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-label text-primary-fg">
              <EventTypeIcon type={event.type} />
              <span className="min-w-0 break-words">{[EVENT_TYPE_LABELS[event.type], event.team?.name].filter(Boolean).join(" · ")}</span>
            </p>
            <EventStatusChip status={event.status} />
          </div>
          <EventFacts event={event} />
          <AnswerArea row={row} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
