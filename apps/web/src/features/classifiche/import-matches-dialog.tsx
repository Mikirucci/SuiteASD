"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { Alert, Button, DataTable, Dialog, DialogClose, DialogContent, useToast, type DataTableColumn } from "@/components/ui";
import { describeError, useApiMutation } from "@/lib/api";
import { pluralize } from "@/lib/format";

/** Same limit as the API (characters of CSV text). */
const MAX_CSV_CHARS = 200_000;
const MAX_ERRORS_SHOWN = 30;
const COLLECTIONS = ["groups", "group-teams", "matches", "standings", "events", "rounds"];

interface ImportMatchesResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  teamsCreated: number;
  matchesCreated: number;
  matchesUpdated: number;
  resultsSet: number;
  eventsCreated: number;
  ignoredColumns: string[];
  errors: Array<{ row: number; field: string | null; message: string }>;
}

const MESSAGES: Record<string, string> = {
  "The team name is missing": "Manca il nome della squadra",
  "A team cannot play against itself": "Una squadra non può giocare contro se stessa",
  "The round must be a number from 1": "La giornata deve essere un numero da 1",
  "The date is not valid: use gg/mm/aaaa or aaaa-mm-gg": "Data non valida: scrivila come gg/mm/aaaa",
  "The time is not valid: use hh:mm": "Ora non valida: scrivila come hh:mm",
  "A time needs a date": "Per indicare l'ora serve anche la data",
  "The result must look like 3-1": "Il risultato deve essere scritto come 3-1",
  "Both set counts are needed, as single digits": "Servono i set di entrambe le squadre, come cifre singole",
  "The winner must win exactly 3 sets and the loser fewer": "Chi vince deve vincere esattamente 3 set",
  "The same match appears twice in the file": "La stessa partita compare due volte nel file",
};

const FIELD_LABELS: Record<string, string> = {
  giornata: "Giornata",
  data: "Data",
  ora: "Ora",
  casa: "Casa",
  ospite: "Ospite",
  risultato: "Risultato",
  set: "Set",
};

type Problem = ImportMatchesResult["errors"][number];

const ERROR_COLUMNS: readonly DataTableColumn<Problem>[] = [
  { key: "row", header: "Riga", cell: (error) => error.row },
  { key: "field", header: "Campo", cell: (error) => (error.field ? (FIELD_LABELS[error.field] ?? error.field) : "Riga") },
  { key: "problem", header: "Problema", cell: (error) => MESSAGES[error.message] ?? error.message },
];

export interface ImportMatchesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competitionId: string;
  groupId: string;
  groupName: string;
}

/** Brings the calendar and the results of a group in from a CSV file: a check first, then the import. */
export function ImportMatchesDialog({ open, onOpenChange, competitionId, groupId, groupName }: ImportMatchesDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importer = useApiMutation(
    ({ csv, dryRun }: { csv: string; dryRun: boolean }, client) =>
      client.post<ImportMatchesResult>(`/competitions/${competitionId}/groups/${groupId}/matches/import`, { csv, dryRun }),
    {
      onSuccess: async (result) => {
        if (result.dryRun) return;
        await Promise.all(COLLECTIONS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      },
    },
  );
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportMatchesResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setCsv(null);
      setPreview(null);
      setProblem(null);
      importer.reset();
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setCsv(null);
    setProblem(null);
    if (!file) return;
    const text = await file.text();
    if (text.length > MAX_CSV_CHARS) {
      setProblem("Il file è troppo grande. Dividilo in più file con meno righe.");
      return;
    }
    setCsv(text);
    try {
      setPreview(await importer.mutateAsync({ csv: text, dryRun: true }));
    } catch (error) {
      setProblem(describeError(error));
    }
  }

  async function confirm() {
    if (!csv) return;
    setProblem(null);
    try {
      const result = await importer.mutateAsync({ csv, dryRun: false });
      toast({
        title: "Calendario importato",
        description: `${pluralize(result.matchesCreated, "partita nuova", "partite nuove")}, ${pluralize(result.matchesUpdated, "aggiornata", "aggiornate")}.`,
        tone: "success",
      });
      close(false);
    } catch (error) {
      setProblem(describeError(error));
    }
  }

  const checking = importer.isPending && preview === null;
  const importing = importer.isPending && preview !== null;
  const nothingToDo = !preview || preview.validRows === 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={`Importa le partite di ${groupName}`}
        description="Dal file della federazione, o da un foglio Excel salvato come CSV. Prima controlliamo senza salvare nulla, poi confermi."
        className="max-w-2xl"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button onClick={() => void confirm()} disabled={nothingToDo} loading={importing}>
              {preview && preview.validRows > 0 ? `Importa ${pluralize(preview.validRows, "partita", "partite")}` : "Importa"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 p-1">
          <div className="flex flex-col gap-2">
            <label htmlFor="import-matches-file" className="text-sm font-semibold text-fg">
              File CSV
            </label>
            <input
              id="import-matches-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void onFileChange(event)}
              aria-describedby="import-matches-hint"
              className="w-full min-w-0 rounded-md border border-line-control bg-surface text-sm text-fg shadow-soft file:mr-4 file:h-11 file:cursor-pointer file:border-0 file:bg-primary-soft file:px-4 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            <p id="import-matches-hint" className="text-xs text-fg-muted">
              Una riga per partita, con le colonne giornata, data (gg/mm/aaaa), ora, casa, ospite e, se già giocata, risultato (per esempio 3-1). Le squadre che non
              ci sono ancora vengono aggiunte al girone; le tue squadre vengono riconosciute dal nome, e per le loro partite da giocare si crea l&apos;evento in calendario.
              Una partita già presente viene aggiornata, non duplicata.
            </p>
          </div>

          {checking ? (
            <p role="status" className="text-sm text-fg-muted">
              Controllo del file in corso…
            </p>
          ) : null}
          {problem ? <Alert tone="danger">{problem}</Alert> : null}

          {preview ? (
            <div className="flex flex-col gap-4">
              <ul aria-label="Esito del controllo" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <li className="text-fg-muted">{pluralize(preview.totalRows, "riga letta", "righe lette")}</li>
                <li className="flex items-center gap-1.5 font-semibold text-success">
                  <CircleCheck aria-hidden="true" className="size-4" />
                  {preview.validRows} valide
                </li>
                <li className={preview.invalidRows > 0 ? "flex items-center gap-1.5 font-semibold text-danger" : "text-fg-muted"}>
                  {preview.invalidRows > 0 ? <CircleAlert aria-hidden="true" className="size-4" /> : null}
                  {preview.invalidRows} con errori
                </li>
              </ul>
              {preview.validRows > 0 ? (
                <ul aria-label="Cosa succede" className="list-disc pl-5 text-sm text-fg-muted">
                  <li>{pluralize(preview.matchesCreated, "partita nuova", "partite nuove")}</li>
                  <li>{pluralize(preview.matchesUpdated, "partita già presente, aggiornata", "partite già presenti, aggiornate")}</li>
                  <li>{pluralize(preview.teamsCreated, "squadra aggiunta al girone", "squadre aggiunte al girone")}</li>
                  <li>{pluralize(preview.resultsSet, "risultato inserito", "risultati inseriti")}</li>
                  <li>{pluralize(preview.eventsCreated, "evento creato in calendario", "eventi creati in calendario")}</li>
                </ul>
              ) : null}
              {preview.ignoredColumns.length > 0 ? <Alert tone="info">Colonne non riconosciute e ignorate: {preview.ignoredColumns.join(", ")}.</Alert> : null}
              {preview.invalidRows > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-fg-muted">
                    Le righe con errori non verranno importate. Correggile nel file e ricaricalo, oppure importa solo quelle valide.
                  </p>
                  <DataTable
                    label="Righe con errori"
                    rows={preview.errors.slice(0, MAX_ERRORS_SHOWN)}
                    columns={ERROR_COLUMNS}
                    getKey={(error) => `${error.row}-${error.field ?? ""}-${error.message}`}
                    empty={null}
                  />
                  {preview.errors.length > MAX_ERRORS_SHOWN ? (
                    <p className="text-xs text-fg-muted">E altri {preview.errors.length - MAX_ERRORS_SHOWN} errori.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
