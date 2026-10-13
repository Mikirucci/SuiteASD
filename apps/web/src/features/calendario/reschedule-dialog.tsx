"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, useToast } from "@/components/ui";
import { useApiMutation } from "@/lib/api";
import { useCalendarVenues, useInvalidateCalendar } from "./api";
import { describeCalendarError, formatWhen } from "./format";
import { rescheduleSchema, toRescheduleBody, valuesOfReschedule, type RescheduleValues } from "./schemas";
import type { CalendarEvent } from "./types";

const FORM_ID = "reschedule-form";

interface RescheduleFormProps {
  event: CalendarEvent;
  onSaved: (event: CalendarEvent) => void;
}

function RescheduleForm({ event, onSaved }: RescheduleFormProps) {
  const { toast } = useToast();
  const invalidate = useInvalidateCalendar();
  const venues = useCalendarVenues();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RescheduleValues>({ resolver: zodResolver(rescheduleSchema), defaultValues: valuesOfReschedule(event) });

  const save = useApiMutation(
    (values: RescheduleValues, client) => client.patch<CalendarEvent>(`/events/${event.id}`, toRescheduleBody(values, event)),
    { onSuccess: invalidate },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values);
      toast({ title: "Evento spostato", description: "Atleti e genitori sono stati avvisati.", tone: "success" });
      onSaved(saved);
    } catch (error) {
      setFormError(describeCalendarError(error));
    }
  });

  const venueOptions = [{ value: "", label: "Nessun luogo" }, ...(venues.data ?? []).map((venue) => ({ value: venue.id, label: venue.name }))];

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nuova data" type="date" required error={errors.date?.message} {...register("date")} />
          <Input label="Nuova ora di inizio" type="time" required error={errors.startTime?.message} {...register("startTime")} />
        </div>
        <Select label="Luogo" options={venueOptions} error={errors.venueId?.message} {...register("venueId")} />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<CalendarClock />} loading={isSubmitting}>
          Sposta l&apos;evento
        </Button>
      </div>
    </>
  );
}

export interface RescheduleDialogProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
}

/** Moves an event in time or place; the API marks it as postponed and notifies athletes and guardians. */
export function RescheduleDialog({ event, onClose, onSaved }: RescheduleDialogProps) {
  if (!event) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Sposta l'evento" description={`${event.title} · ora: ${formatWhen(event)}. Atleti e genitori ricevono un avviso.`}>
        <RescheduleForm key={event.id} event={event} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
