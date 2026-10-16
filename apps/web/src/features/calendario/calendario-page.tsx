"use client";

import { CalendarDays, ClipboardCheck, Download, FileUp, Plus } from "lucide-react";
import { useState } from "react";
import {
  Alert,
  Button,
  ButtonLink,
  DataBoundary,
  EmptyState,
  SectionHeading,
  Select,
  WeekStrip,
  useToast,
} from "@/components/ui";
import { useApiMutation } from "@/lib/api";
import { isSameDay, startOfDay } from "@/lib/dates";
import { saveFile } from "@/lib/save-file";
import { useCalendarTeams, useMatchContexts, useWeekEvents } from "./api";
import { CancelEventDialog } from "./cancel-event-dialog";
import { ConvocateDialog } from "./convocate-dialog";
import { EventCard } from "./event-card";
import { EventDetailDialog, type EventAction } from "./event-detail-dialog";
import { EventFormDialog, type EventFormState } from "./event-form-dialog";
import { ImportEventsDialog } from "./import-events-dialog";
import { describeCalendarError, formatDayTitle, pluralize, toDateInput } from "./format";
import { PendingConvocations } from "./pending-convocations";
import { RescheduleDialog } from "./reschedule-dialog";
import type { CalendarEvent } from "./types";
import { useCalendarAccess } from "./use-calendar-access";
import { WeekNavigator } from "./week-navigator";

type Panel =
  | { name: "detail" | "reschedule" | "cancel" | "convocate"; event: CalendarEvent }
  | { name: "form"; form: EventFormState }
  | null;

/** Module 04: week strip with the events of the day, event management and the squad of every match. */
export function CalendarioPage() {
  const access = useCalendarAccess();
  const { toast } = useToast();
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [teamId, setTeamId] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [importing, setImporting] = useState(false);

  const teams = useCalendarTeams();
  const week = useWeekEvents(day, teamId);

  const events = week.data ?? [];
  const dayEvents = events
    .filter((event) => isSameDay(new Date(event.startsAt), day))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const eventDays = events.filter((event) => event.status !== "CANCELLED").map((event) => new Date(event.startsAt));
  const hasMatches = dayEvents.some((event) => event.type === "MATCH");
  const matchContexts = useMatchContexts(hasMatches);

  const exportCalendar = useApiMutation(
    async (_input: void, client) => {
      const file = await client.download("/events/export.ics", { query: { teamId: teamId || undefined } });
      saveFile(file, "calendario.ics");
    },
    {
      onSuccess: () =>
        toast({
          title: "Calendario esportato",
          description: "Importa il file in Google Calendar, Apple Calendar o Outlook.",
          tone: "success",
        }),
    },
  );

  const closePanel = () => setPanel(null);
  const showSaved = (event: CalendarEvent) => {
    setDay(startOfDay(new Date(event.startsAt)));
    setPanel({ name: "detail", event });
  };
  const handleAction = (action: EventAction, event: CalendarEvent) => {
    if (action === "edit") setPanel({ name: "form", form: { mode: "edit", event } });
    else setPanel({ name: action, event });
  };
  const backToDetail = (event: CalendarEvent) => setPanel({ name: "detail", event });
  const handleFormSaved = (event: CalendarEvent) => {
    if (panel?.name === "form" && panel.form.mode === "create") {
      setDay(startOfDay(new Date(event.startsAt)));
      closePanel();
    } else {
      showSaved(event);
    }
  };
  const leaveConvocate = () => {
    if (panel?.name === "convocate") backToDetail(panel.event);
  };

  const teamOptions = [{ value: "", label: "Tutte le squadre" }, ...(teams.data ?? []).map((team) => ({ value: team.id, label: team.name }))];
  const openForm = () => setPanel({ name: "form", form: { mode: "create", day: toDateInput(day) } });

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        index={4}
        label="Calendario e convocazioni"
        title="Partite e convocazioni, già organizzate."
        highlight="già organizzate."
        description={
          access.canRespond
            ? "Conferma la presenza alle partite: ti basta un tocco, anche per i tuoi figli."
            : "Partite, allenamenti, tornei e riunioni. Le convocazioni partono da sole prima della gara."
        }
      />

      {access.canRespond ? <PendingConvocations /> : null}

      <section aria-label="Calendario della settimana" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            className="min-w-0 flex-1 sm:max-w-xs"
            label="Squadra"
            options={teamOptions}
            value={teamId}
            onChange={(change) => setTeamId(change.target.value)}
            hint={teams.error ? "Le squadre non sono disponibili al momento." : undefined}
          />
          <div className="flex flex-wrap gap-2">
            {access.canSeeAttendance ? (
              <ButtonLink href="/calendario/presenze" variant="secondary">
                <ClipboardCheck aria-hidden="true" />
                Presenze allenamenti
              </ButtonLink>
            ) : null}
            <Button variant="secondary" leftIcon={<Download />} loading={exportCalendar.isPending} onClick={() => exportCalendar.mutate()}>
              Esporta in iCal
            </Button>
            {access.canWriteEvents ? (
              <Button variant="secondary" leftIcon={<FileUp />} onClick={() => setImporting(true)}>
                Importa da file
              </Button>
            ) : null}
            {access.canWriteEvents ? (
              <Button leftIcon={<Plus />} onClick={openForm}>
                Nuovo evento
              </Button>
            ) : null}
          </div>
        </div>
        {exportCalendar.error ? <Alert tone="danger">{describeCalendarError(exportCalendar.error)}</Alert> : null}

        <WeekNavigator day={day} onChange={setDay} />
        <WeekStrip weekOf={day} selected={day} onSelect={setDay} eventDays={eventDays} />

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold tracking-title text-fg">
            {formatDayTitle(day)}
            {dayEvents.length > 0 ? (
              <span className="ml-2 text-sm font-semibold text-fg-muted">{pluralize(dayEvents.length, "evento", "eventi")}</span>
            ) : null}
          </h2>
          <DataBoundary
            isLoading={week.isLoading}
            error={week.error}
            onRetry={() => void week.refetch()}
            loadingLabel="Caricamento degli eventi"
            skeletonRows={2}
            isEmpty={dayEvents.length === 0}
            empty={
              <EmptyState
                icon={CalendarDays}
                title="Nessun evento in questo giorno"
                description={
                  events.length > 0
                    ? "Scegli un giorno con il pallino verde per vedere partite e allenamenti della settimana."
                    : access.canWriteEvents
                      ? "Aggiungi una partita, un allenamento, un torneo o una riunione: compare subito qui."
                      : "Quando la società aggiunge un evento lo trovi qui."
                }
                action={
                  access.canWriteEvents ? (
                    <Button leftIcon={<Plus />} onClick={openForm}>
                      Nuovo evento
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            <ul aria-label="Eventi del giorno" className="flex flex-col gap-3">
              {dayEvents.map((event) => (
                <li key={event.id}>
                  <EventCard
                    event={event}
                    matchContext={matchContexts.data?.[event.id]}
                    onOpen={(target) => setPanel({ name: "detail", event: target })}
                  />
                </li>
              ))}
            </ul>
          </DataBoundary>
        </div>
      </section>

      <EventDetailDialog
        event={panel?.name === "detail" ? panel.event : null}
        access={access}
        matchContext={panel?.name === "detail" ? matchContexts.data?.[panel.event.id] : undefined}
        onClose={closePanel}
        onAction={handleAction}
      />
      <EventFormDialog
        state={panel?.name === "form" ? panel.form : null}
        onClose={closePanel}
        onSaved={handleFormSaved}
      />
      {access.canWriteEvents ? <ImportEventsDialog open={importing} onOpenChange={setImporting} teams={teams.data ?? []} /> : null}
      <RescheduleDialog event={panel?.name === "reschedule" ? panel.event : null} onClose={closePanel} onSaved={showSaved} />
      <CancelEventDialog event={panel?.name === "cancel" ? panel.event : null} onClose={closePanel} onCancelled={showSaved} />
      <ConvocateDialog
        event={panel?.name === "convocate" ? panel.event : null}
        canOverride={access.canOverride}
        onClose={leaveConvocate}
        onDone={leaveConvocate}
      />
    </div>
  );
}
