"use client";

import { Ban, CalendarClock, ClipboardCheck, Pencil, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, Button, ButtonLink, Dialog, DialogContent } from "@/components/ui";
import { ConvocationsPanel } from "./convocations-panel";
import { eyebrowOf, EventStatusChip, EventTypeIcon } from "./event-card";
import { formatWhen, isOpen } from "./format";
import type { CalendarAccess } from "./use-calendar-access";
import type { CalendarEvent, MatchContext } from "./types";

export type EventAction = "edit" | "reschedule" | "cancel" | "convocate";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-fg">{children}</dd>
    </>
  );
}

export interface EventDetailDialogProps {
  event: CalendarEvent | null;
  access: CalendarAccess;
  matchContext?: MatchContext;
  onClose: () => void;
  onAction: (action: EventAction, event: CalendarEvent) => void;
}

/** An event with its place, notes and (for matches and tournaments) the squad with the answers of the athletes. */
export function EventDetailDialog({ event, access, matchContext, onClose, onAction }: EventDetailDialogProps) {
  if (!event) return null;
  const cancelled = event.status === "CANCELLED";
  const showConvocations = event.type === "MATCH" || event.type === "TOURNAMENT";
  const canEdit = access.canWriteEvents && !cancelled;
  const canMove = canEdit && isOpen(event);
  const isSeries = event.recurrenceRule !== null || event.recurrenceParentId !== null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg"
        title={event.title}
        description={formatWhen(event)}
        footer={
          canEdit ? (
            <>
              <Button variant="secondary" leftIcon={<Pencil />} onClick={() => onAction("edit", event)}>
                Modifica
              </Button>
              {canMove ? (
                <Button variant="secondary" leftIcon={<CalendarClock />} onClick={() => onAction("reschedule", event)}>
                  Sposta
                </Button>
              ) : null}
              {canMove ? (
                <Button variant="danger" leftIcon={<Ban />} onClick={() => onAction("cancel", event)}>
                  Annulla evento
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-label text-primary-fg">
              <EventTypeIcon type={event.type} />
              <span className="min-w-0 break-words">{eyebrowOf(event, matchContext)}</span>
            </p>
            <EventStatusChip status={event.status} />
          </div>
          {cancelled ? <Alert tone="info">Evento annullato: atleti e genitori sono stati avvisati.</Alert> : null}
          <dl className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
            {event.team ? <Detail label="Squadra">{event.team.name}</Detail> : null}
            {event.venue ? (
              <Detail label="Luogo">
                {event.venue.name}
                {event.venue.address ? <span className="block font-normal text-fg-muted">{event.venue.address}</span> : null}
              </Detail>
            ) : null}
            {isSeries ? (
              <Detail label="Ripetizione">
                <span className="inline-flex items-center gap-1.5">
                  <Repeat aria-hidden="true" className="size-4" />
                  Allenamento della serie settimanale
                </span>
              </Detail>
            ) : null}
            {event.notes ? <Detail label="Note">{event.notes}</Detail> : null}
          </dl>
          {event.type === "TRAINING" && access.canSeeAttendance && !cancelled ? (
            <ButtonLink href="/calendario/presenze" variant="secondary" className="self-start">
              <ClipboardCheck aria-hidden="true" />
              Registra le presenze
            </ButtonLink>
          ) : null}
          {showConvocations && !cancelled ? (
            <ConvocationsPanel event={event} access={access} onConvocate={() => onAction("convocate", event)} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
