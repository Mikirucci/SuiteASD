"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { Alert, Button, Dialog, DialogClose, DialogContent, Select, useToast } from "@/components/ui";
import { describeError, useApiMutation } from "@/lib/api";
import { useCalendarVenues } from "./api";
import { EVENT_TYPE_OPTIONS, pluralize } from "./format";
import type { EventType, TeamOption } from "./types";

/** Same limit as the API (characters of calendar text). */
const MAX_ICS_CHARS = 500_000;

interface ImportEventsResult {
  dryRun: boolean;
  eventsInFile: number;
  created: number;
  alreadyPresent: number;
  allDaySkipped: number;
  repetitionsNotImported: number;
  errors: Array<{ event: number; message: string }>;
}

interface ImportBody {
  ics: string;
  type: EventType;
  teamId?: string;
  venueId?: string;
  dryRun: boolean;
}

/** The API reports the problems of a file in English: Italian wording for the ones it can say. */
export function describeIcsProblem(message: string): string {
  if (message === "The event has no title") return "L'evento non ha un titolo";
  const badStart = /^"(.*)": the start date is missing or not valid$/.exec(message);
  if (badStart) return `«${badStart[1] ?? ""}»: la data di inizio manca o non è valida`;
  return message;
}

export interface ImportEventsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: readonly TeamOption[];
}

/** Brings the events of a calendar file (.ics) in: first a check that saves nothing, then the import. */
export function ImportEventsDialog({ open, onOpenChange, teams }: ImportEventsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const venues = useCalendarVenues();
  const importer = useApiMutation((body: ImportBody, client) => client.post<ImportEventsResult>("/events/import", body), {
    onSuccess: (result) => (result.dryRun ? undefined : queryClient.invalidateQueries({ queryKey: ["events"] })),
  });
  const [ics, setIcs] = useState<string | null>(null);
  const [type, setType] = useState<EventType>("TRAINING");
  const [teamId, setTeamId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [preview, setPreview] = useState<ImportEventsResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const bodyOf = (text: string, dryRun: boolean, chosen: { type: EventType; teamId: string; venueId: string }): ImportBody => ({
    ics: text,
    type: chosen.type,
    dryRun,
    ...(chosen.teamId ? { teamId: chosen.teamId } : {}),
    ...(chosen.venueId ? { venueId: chosen.venueId } : {}),
  });

  async function check(text: string, chosen: { type: EventType; teamId: string; venueId: string }) {
    setProblem(null);
    setPreview(null);
    try {
      setPreview(await importer.mutateAsync(bodyOf(text, true, chosen)));
    } catch (error) {
      setProblem(describeError(error));
    }
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setIcs(null);
      setPreview(null);
      setProblem(null);
      importer.reset();
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setIcs(null);
    setPreview(null);
    setProblem(null);
    if (!file) return;
    const text = await file.text();
    if (text.length > MAX_ICS_CHARS) {
      setProblem("Il file è troppo grande. Esporta un periodo più breve dal calendario.");
      return;
    }
    setIcs(text);
    await check(text, { type, teamId, venueId });
  }

  // Changing what the events become changes the check: it runs again on the same file
  function choose(change: Partial<{ type: EventType; teamId: string; venueId: string }>) {
    const next = { type, teamId, venueId, ...change };
    setType(next.type);
    setTeamId(next.teamId);
    setVenueId(next.venueId);
    if (ics) void check(ics, next);
  }

  async function confirm() {
    if (!ics) return;
    setProblem(null);
    try {
      const result = await importer.mutateAsync(bodyOf(ics, false, { type, teamId, venueId }));
      toast({ title: result.created === 1 ? "1 evento importato" : `${result.created} eventi importati`, tone: "success" });
      close(false);
    } catch (error) {
      setProblem(describeError(error));
    }
  }

  const checking = importer.isPending && preview === null;
  const importing = importer.isPending && preview !== null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title="Importa eventi da un file di calendario"
        description="Va bene il file .ics di Google Calendar, Apple Calendar, Outlook o di un sito che pubblica il calendario. Prima controlliamo, poi confermi."
        className="max-w-2xl"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button onClick={() => void confirm()} disabled={!preview || preview.created === 0} loading={importing}>
              {preview && preview.created > 0 ? `Importa ${pluralize(preview.created, "evento", "eventi")}` : "Importa"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 p-1">
          <div className="flex flex-col gap-2">
            <label htmlFor="import-ics" className="text-sm font-semibold text-fg">
              File di calendario (.ics)
            </label>
            <input
              id="import-ics"
              type="file"
              accept=".ics,text/calendar"
              onChange={(event) => void onFileChange(event)}
              aria-describedby="import-ics-hint"
              className="w-full min-w-0 rounded-md border border-line-control bg-surface text-sm text-fg shadow-soft file:mr-4 file:h-11 file:cursor-pointer file:border-0 file:bg-primary-soft file:px-4 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            <p id="import-ics-hint" className="text-xs text-fg-muted">
              Gli allenamenti che si ripetono ogni settimana vengono creati per intero (fino a 100 date). Gli eventi che durano tutto il giorno non vengono importati.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Tipo di evento" options={EVENT_TYPE_OPTIONS} value={type} onChange={(event) => choose({ type: event.target.value as EventType })} />
            <Select
              label="Squadra"
              placeholder="Nessuna"
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
              value={teamId}
              onChange={(event) => choose({ teamId: event.target.value })}
            />
            <Select
              label="Palestra"
              placeholder="Nessuna"
              options={(venues.data ?? []).map((venue) => ({ value: venue.id, label: venue.name }))}
              value={venueId}
              onChange={(event) => choose({ venueId: event.target.value })}
            />
          </div>

          {checking ? (
            <p role="status" className="text-sm text-fg-muted">
              Controllo del file in corso…
            </p>
          ) : null}
          {problem ? <Alert tone="danger">{problem}</Alert> : null}

          {preview ? (
            <div className="flex flex-col gap-3">
              <ul aria-label="Esito del controllo" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <li className="text-fg-muted">{pluralize(preview.eventsInFile, "evento letto", "eventi letti")}</li>
                <li className="flex items-center gap-1.5 font-semibold text-success">
                  <CircleCheck aria-hidden="true" className="size-4" />
                  {preview.created} da creare
                </li>
                {preview.alreadyPresent > 0 ? <li className="text-fg-muted">{preview.alreadyPresent} già nel calendario</li> : null}
                {preview.allDaySkipped > 0 ? <li className="text-fg-muted">{preview.allDaySkipped} di tutto il giorno, saltati</li> : null}
                {preview.errors.length > 0 ? (
                  <li className="flex items-center gap-1.5 font-semibold text-danger">
                    <CircleAlert aria-hidden="true" className="size-4" />
                    {pluralize(preview.errors.length, "con errori", "con errori")}
                  </li>
                ) : null}
              </ul>
              {preview.repetitionsNotImported > 0 ? (
                <Alert tone="info">
                  {pluralize(preview.repetitionsNotImported, "evento si ripete", "eventi si ripetono")} in un modo che non riusciamo a creare: è entrata solo la prima data.
                </Alert>
              ) : null}
              {preview.errors.length > 0 ? (
                <ul aria-label="Eventi con errori" className="list-disc pl-5 text-sm text-fg-muted">
                  {preview.errors.slice(0, 20).map((error) => (
                    <li key={`${error.event}-${error.message}`}>
                      Evento {error.event}: {describeIcsProblem(error.message)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
