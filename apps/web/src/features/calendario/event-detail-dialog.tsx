"use client";

import { Ban, CalendarClock, ClipboardCheck, Pencil } from "lucide-react";
import { Alert, Button, ButtonLink, Dialog, DialogContent } from "@/components/ui";
import { ConvocationsPanel } from "./convocations-panel";
import { eyebrowOf, EventStatusChip, EventTypeIcon } from "./event-card";
import { EventFacts } from "./event-facts";
import { formatWhen, isOpen } from "./format";
import type { CalendarAccess } from "./use-calendar-access";
import type { CalendarEvent, MatchContext } from "./types";

export type EventAction = "edit" | "reschedule" | "cancel" | "convocate";

export interface EventDetailDialogProps {
  event: CalendarEvent | null;
  access: CalendarAccess;
  matchContext?: MatchContext;
  onClose: () => void;
  onAction: (action: EventAction, event: CalendarEvent) => void;
}

/** An event with its place, notes and, for the events of a team (or with athletes convocated by hand), the squad with the answers. */
export function EventDetailDialog({ event, access, matchContext, onClose, onAction }: EventDetailDialogProps) {
  if (!event) return null;
  const cancelled = event.status === "CANCELLED";
  const showConvocations = event.team !== null || event.convocations.total > 0;
  const canEdit = access.canWriteEvents && !cancelled;
  const canMove = canEdit && isOpen(event);

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
          <EventFacts event={event} />
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
