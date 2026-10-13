"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, Dumbbell, Save, X } from "lucide-react";
import { useState } from "react";
import { Alert, Avatar, Button, DataBoundary, EmptyState, Select, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { addDays, startOfDay } from "@/lib/dates";
import { useApiMutation } from "@/lib/api";
import { useAllPages } from "@/lib/use-all-pages";
import { useAttendanceSheet } from "./api";
import { describeCalendarError, formatDayTitle, formatTime, pluralize } from "./format";
import type { AttendanceEntry, AttendanceSheet, CalendarEvent, CheckInBody } from "./types";

const PAST_DAYS = 21;
const FUTURE_DAYS = 7;

const TOGGLE_BASE =
  "inline-flex h-11 min-w-24 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold ring-1 ring-inset " +
  "transition-colors duration-150 ease-soft [&_svg]:size-4";

interface PresenceToggleProps {
  name: string;
  value: boolean | null;
  onChange: (present: boolean) => void;
}

function PresenceToggle({ name, value, onChange }: PresenceToggleProps) {
  return (
    <div role="group" aria-label={`Presenza di ${name}`} className="flex gap-2">
      <button
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(true)}
        className={cn(TOGGLE_BASE, value === true ? "bg-success-soft text-success ring-success-line" : "bg-surface text-fg-muted ring-line hover:bg-ink-50")}
      >
        <Check aria-hidden="true" strokeWidth={3} />
        Presente
      </button>
      <button
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(false)}
        className={cn(TOGGLE_BASE, value === false ? "bg-danger-soft text-danger ring-danger-line" : "bg-surface text-fg-muted ring-line hover:bg-ink-50")}
      >
        <X aria-hidden="true" strokeWidth={3} />
        Assente
      </button>
    </div>
  );
}

function ReadOnlyMark({ present }: { present: boolean | null }) {
  if (present === null) return <span className="text-xs font-semibold text-fg-muted">Da segnare</span>;
  return present ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
      <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
      Presente
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-danger">
      <X aria-hidden="true" className="size-3.5" strokeWidth={3} />
      Assente
    </span>
  );
}

interface SheetEditorProps {
  eventId: string;
  sheet: AttendanceSheet;
  canCheckIn: boolean;
}

/** The check-in sheet: one row per athlete, a tap each, saved in one request. */
function SheetEditor({ eventId, sheet, canCheckIn }: SheetEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const presentOf = (entry: AttendanceEntry): boolean | null => marks[entry.member.id] ?? entry.present;

  const values = sheet.data.map(presentOf);
  const present = values.filter((value) => value === true).length;
  const absent = values.filter((value) => value === false).length;
  const toRecord = values.length - present - absent;

  const save = useApiMutation((body: CheckInBody, client) => client.put<AttendanceSheet>(`/events/${eventId}/attendance`, body), {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setMarks({});
      toast({ title: "Presenze salvate", description: `${pluralize(present, "presente", "presenti")} · ${pluralize(absent, "assente", "assenti")}`, tone: "success" });
    },
  });

  const submit = () => {
    const entries = sheet.data.flatMap((entry) => {
      const value = presentOf(entry);
      return value === null ? [] : [{ memberId: entry.member.id, present: value }];
    });
    save.mutate({ entries });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-fg" aria-live="polite">
        {pluralize(present, "presente", "presenti")} · {pluralize(absent, "assente", "assenti")} · {toRecord} da segnare
      </p>
      {save.error ? <Alert tone="danger">{describeCalendarError(save.error)}</Alert> : null}
      <ul aria-label="Atleti dell'allenamento" className="flex flex-col gap-2">
        {sheet.data.map((entry) => {
          const name = `${entry.member.firstName} ${entry.member.lastName}`;
          return (
            <li key={entry.member.id} className="flex flex-col gap-3 rounded-lg bg-surface p-3 shadow-soft sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={name} decorative />
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-fg">{name}</p>
                  {entry.member.fieldRole ? <p className="text-xs text-fg-muted">{entry.member.fieldRole}</p> : null}
                </div>
              </div>
              {canCheckIn ? (
                <PresenceToggle
                  name={name}
                  value={presentOf(entry)}
                  onChange={(value) => setMarks((current) => ({ ...current, [entry.member.id]: value }))}
                />
              ) : (
                <ReadOnlyMark present={presentOf(entry)} />
              )}
            </li>
          );
        })}
      </ul>
      {canCheckIn ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" leftIcon={<Check />} onClick={() => setMarks(Object.fromEntries(sheet.data.map((entry) => [entry.member.id, true])))}>
            Tutti presenti
          </Button>
          <Button leftIcon={<Save />} loading={save.isPending} disabled={present + absent === 0} onClick={submit}>
            Salva presenze
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function trainingLabel(event: CalendarEvent): string {
  return `${formatDayTitle(new Date(event.startsAt))} · ${formatTime(event.startsAt)}`;
}

/** The latest training that already started, or the first one ahead: where a coach most likely wants to check in. */
function defaultTraining(trainings: readonly CalendarEvent[], now: Date): CalendarEvent | undefined {
  return [...trainings].reverse().find((event) => new Date(event.startsAt) <= now) ?? trainings[0];
}

export interface CheckInViewProps {
  teamId: string;
  canCheckIn: boolean;
}

/** Quick check-in: pick a recent or upcoming training of the team and mark who is there. */
export function CheckInView({ teamId, canCheckIn }: CheckInViewProps) {
  const today = startOfDay(new Date());
  const from = addDays(today, -PAST_DAYS).toISOString();
  const to = addDays(today, FUTURE_DAYS + 1).toISOString();
  const trainingsQuery = useAllPages<CalendarEvent>(["events", "trainings", { teamId, from, to }], "/events", {
    type: "TRAINING",
    teamId,
    from,
    to,
  });
  const [chosenId, setChosenId] = useState<string | null>(null);

  const trainings = (trainingsQuery.data ?? [])
    .filter((event) => event.status !== "CANCELLED")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const eventId = chosenId ?? defaultTraining(trainings, new Date())?.id ?? null;
  const sheet = useAttendanceSheet(eventId);

  return (
    <div className="flex flex-col gap-4">
      <DataBoundary
        isLoading={trainingsQuery.isLoading}
        error={trainingsQuery.error}
        onRetry={() => void trainingsQuery.refetch()}
        loadingLabel="Caricamento degli allenamenti"
        skeletonRows={2}
        isEmpty={trainings.length === 0}
        empty={
          <EmptyState
            icon={Dumbbell}
            title="Nessun allenamento in programma"
            description="Aggiungi gli allenamenti dal calendario, anche ripetuti ogni settimana: qui li trovi per segnare le presenze."
          />
        }
      >
        <Select
          label="Allenamento"
          options={trainings.map((event) => ({ value: event.id, label: trainingLabel(event) }))}
          value={eventId ?? ""}
          onChange={(change) => setChosenId(change.target.value)}
          hint="Gli allenamenti delle ultime tre settimane e della prossima."
        />
        <DataBoundary
          isLoading={sheet.isLoading}
          error={sheet.error}
          onRetry={() => void sheet.refetch()}
          loadingLabel="Caricamento dei presenti"
          isEmpty={sheet.data?.data.length === 0}
          empty={
            <EmptyState
              icon={ClipboardCheck}
              title="Nessun atleta in squadra"
              description="Assegna gli atleti alla squadra dai tesserati: poi potrai segnare le presenze."
            />
          }
        >
          {eventId && sheet.data ? <SheetEditor key={eventId} eventId={eventId} sheet={sheet.data} canCheckIn={canCheckIn} /> : null}
        </DataBoundary>
      </DataBoundary>
    </div>
  );
}
