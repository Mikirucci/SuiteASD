"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, Switch, Textarea, useToast } from "@/components/ui";
import { useApiMutation, ApiError } from "@/lib/api";
import { useCalendarTeams, useCalendarVenues, useInvalidateCalendar } from "./api";
import { describeCalendarError, EVENT_TYPE_LABELS, EVENT_TYPE_OPTIONS } from "./format";
import {
  emptyEventValues,
  eventFormSchema,
  hasSquad,
  toCreateBody,
  toUpdateBody,
  valuesOfEvent,
  type EventValues,
} from "./schemas";
import type { CalendarEvent, CreatedEvent } from "./types";

const FORM_ID = "event-form";

const FIELD_OF_API_PATH: Record<string, Path<EventValues>> = {
  title: "title",
  startsAt: "startTime",
  endsAt: "endTime",
  teamId: "teamId",
  venueId: "venueId",
  notes: "notes",
  maxConvocations: "maxConvocations",
  "recurrence.count": "repeatCount",
  "recurrence.until": "repeatUntil",
};

const INTERVAL_OPTIONS = [
  { value: "1", label: "Ogni settimana" },
  { value: "2", label: "Ogni 2 settimane" },
  { value: "3", label: "Ogni 3 settimane" },
  { value: "4", label: "Ogni 4 settimane" },
];

const REPEAT_END_OPTIONS = [
  { value: "count", label: "Dopo un numero di allenamenti" },
  { value: "until", label: "Fino a un giorno" },
];

export type EventFormState = { mode: "create"; day: string } | { mode: "edit"; event: CalendarEvent };

interface EventFormProps {
  state: EventFormState;
  onSaved: (event: CalendarEvent) => void;
}

function EventForm({ state, onSaved }: EventFormProps) {
  const { toast } = useToast();
  const invalidate = useInvalidateCalendar();
  const teams = useCalendarTeams();
  const venues = useCalendarVenues();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EventValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: state.mode === "create" ? emptyEventValues(state.day) : valuesOfEvent(state.event),
  });
  const type = useWatch({ control, name: "type" });
  const repeat = useWatch({ control, name: "repeat" });
  const repeatEnd = useWatch({ control, name: "repeatEnd" });
  const isCreate = state.mode === "create";

  const save = useApiMutation(
    async (values: EventValues, client): Promise<CreatedEvent> => {
      if (state.mode === "create") return client.post<CreatedEvent>("/events", toCreateBody(values));
      const updated = await client.patch<CalendarEvent>(`/events/${state.event.id}`, toUpdateBody(values));
      return { ...updated, occurrencesCreated: 1 };
    },
    { onSuccess: invalidate },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values);
      if (state.mode === "create") {
        toast({
          title: saved.occurrencesCreated > 1 ? `${saved.occurrencesCreated} allenamenti creati` : "Evento creato",
          description: saved.title,
          tone: "success",
        });
      } else {
        const moved = saved.startsAt !== state.event.startsAt || saved.venue?.id !== state.event.venue?.id;
        toast({
          title: "Evento aggiornato",
          description: moved ? "Atleti e genitori sono stati avvisati dello spostamento." : saved.title,
          tone: "success",
        });
      }
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          const field = FIELD_OF_API_PATH[fieldError.path];
          if (field) setError(field, { message: "Valore non valido" });
        }
      }
      setFormError(describeCalendarError(error));
    }
  });

  const teamOptions = [{ value: "", label: "Nessuna squadra" }, ...(teams.data ?? []).map((team) => ({ value: team.id, label: team.name }))];
  const venueOptions = [{ value: "", label: "Nessun luogo" }, ...(venues.data ?? []).map((venue) => ({ value: venue.id, label: venue.name }))];
  const lookupFailed = teams.error !== null || venues.error !== null;

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {lookupFailed ? <Alert tone="info">Squadre o luoghi non sono disponibili al momento: puoi salvare e completarli dopo.</Alert> : null}
        {isCreate ? (
          <Select label="Tipo di evento" options={EVENT_TYPE_OPTIONS} {...register("type")} />
        ) : (
          <p className="text-sm text-fg-muted">
            Tipo di evento: <span className="font-semibold text-fg">{EVENT_TYPE_LABELS[state.event.type]}</span>
          </p>
        )}
        <Input
          label="Titolo"
          required
          autoComplete="off"
          hint={type === "MATCH" ? "Per esempio: Aquile Volley vs Delfini Volley." : undefined}
          error={errors.title?.message}
          {...register("title")}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Data" type="date" required error={errors.date?.message} {...register("date")} />
          <Input label="Inizio" type="time" required error={errors.startTime?.message} {...register("startTime")} />
          <Input label="Fine" type="time" error={errors.endTime?.message} {...register("endTime")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Squadra" options={teamOptions} error={errors.teamId?.message} {...register("teamId")} />
          <Select label="Luogo" options={venueOptions} error={errors.venueId?.message} {...register("venueId")} />
        </div>
        {hasSquad(type) ? (
          <Input
            label="Posti per le convocazioni"
            inputMode="numeric"
            hint="Facoltativo, da 1 a 40. Se lo lasci vuoto sono 12."
            error={errors.maxConvocations?.message}
            {...register("maxConvocations")}
          />
        ) : null}
        <Textarea label="Note" rows={3} error={errors.notes?.message} {...register("notes")} />
        {isCreate && type === "TRAINING" ? (
          <div className="flex flex-col gap-4">
            <Switch label="Ripeti ogni settimana" hint="Crea tutti gli allenamenti della serie, alla stessa ora." {...register("repeat")} />
            {repeat ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Frequenza" options={INTERVAL_OPTIONS} {...register("repeatInterval")} />
                <Select label="Fine della serie" options={REPEAT_END_OPTIONS} {...register("repeatEnd")} />
                {repeatEnd === "count" ? (
                  <Input
                    label="Numero di allenamenti"
                    inputMode="numeric"
                    hint="Da 2 a 100, compreso il primo."
                    error={errors.repeatCount?.message}
                    {...register("repeatCount")}
                  />
                ) : (
                  <Input label="Ultimo giorno" type="date" error={errors.repeatUntil?.message} {...register("repeatUntil")} />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          {isCreate ? "Crea l'evento" : "Salva le modifiche"}
        </Button>
      </div>
    </>
  );
}

export interface EventFormDialogProps {
  state: EventFormState | null;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
}

/** Create a match, training (also as a weekly series), tournament or meeting, or edit one. */
export function EventFormDialog({ state, onClose, onSaved }: EventFormDialogProps) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg"
        title={state.mode === "create" ? "Nuovo evento" : "Modifica l'evento"}
        description={
          state.mode === "create"
            ? "Partita, allenamento, torneo o riunione: compare subito nel calendario."
            : "Se cambi giorno, ora o luogo, l'evento risulta spostato e atleti e genitori ricevono un avviso."
        }
      >
        <EventForm key={state.mode === "edit" ? state.event.id : "new"} state={state} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
