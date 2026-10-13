"use client";

import { Ban } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Dialog, DialogClose, DialogContent, Textarea, useToast } from "@/components/ui";
import { useApiMutation } from "@/lib/api";
import { useInvalidateCalendar } from "./api";
import { describeCalendarError, formatWhen } from "./format";
import type { CalendarEvent } from "./types";

const MAX_REASON = 300;

function CancelForm({ event, onCancelled }: { event: CalendarEvent; onCancelled: (event: CalendarEvent) => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateCalendar();
  const [reason, setReason] = useState("");

  const cancel = useApiMutation(
    (text: string, client) => client.post<CalendarEvent>(`/events/${event.id}/cancel`, text ? { reason: text } : {}),
    {
      onSuccess: async (saved) => {
        await invalidate();
        toast({ title: "Evento annullato", description: "Atleti e genitori sono stati avvisati.", tone: "success" });
        onCancelled(saved);
      },
    },
  );

  return (
    <div className="flex flex-col gap-4">
      {cancel.error ? <Alert tone="danger">{describeCalendarError(cancel.error)}</Alert> : null}
      <Textarea
        label="Motivo (facoltativo)"
        rows={3}
        maxLength={MAX_REASON}
        hint="Compare nell'avviso che ricevono atleti e genitori."
        value={reason}
        onChange={(change) => setReason(change.target.value)}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Indietro</Button>
        </DialogClose>
        <Button variant="danger" leftIcon={<Ban />} loading={cancel.isPending} onClick={() => cancel.mutate(reason.trim())}>
          Annulla l&apos;evento
        </Button>
      </div>
    </div>
  );
}

export interface CancelEventDialogProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onCancelled: (event: CalendarEvent) => void;
}

export function CancelEventDialog({ event, onClose, onCancelled }: CancelEventDialogProps) {
  if (!event) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Annullare l'evento?" description={`${event.title} · ${formatWhen(event)}`}>
        <CancelForm key={event.id} event={event} onCancelled={onCancelled} />
      </DialogContent>
    </Dialog>
  );
}
