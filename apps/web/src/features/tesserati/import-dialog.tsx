"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { describeError } from "@/lib/api";
import { useImportMembers } from "./api";
import { describeImportProblem, importFieldLabel } from "./import-messages";
import type { ImportMembersResult } from "./types";

/** Same limit as the API (characters of CSV text). */
const MAX_CSV_CHARS = 900_000;
const MAX_ERRORS_SHOWN = 50;

type ImportError = ImportMembersResult["errors"][number];

const ERROR_COLUMNS: readonly DataTableColumn<ImportError>[] = [
  { key: "row", header: "Riga", cell: (error) => error.row },
  { key: "field", header: "Campo", cell: (error) => importFieldLabel(error.field) },
  { key: "problem", header: "Problema", cell: (error) => describeImportProblem(error.field, error.message) },
];

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Two steps: the file is checked first (dry run, nothing is saved), then the valid rows are imported. */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { toast } = useToast();
  const importer = useImportMembers();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportMembersResult | null>(null);
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
        title: result.created === 1 ? "1 tesserato importato" : `${result.created} tesserati importati`,
        tone: "success",
      });
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
        title="Importa tesserati da CSV"
        description="Prima controlliamo il file senza salvare nulla, poi confermi."
        className="max-w-2xl"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button onClick={() => void confirm()} disabled={!preview || preview.validRows === 0} loading={importing}>
              {preview && preview.validRows > 0
                ? `Importa ${preview.validRows} ${preview.validRows === 1 ? "tesserato" : "tesserati"}`
                : "Importa"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 p-1">
          <div className="flex flex-col gap-2">
            <label htmlFor="import-file" className="text-sm font-semibold text-fg">
              File CSV
            </label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void onFileChange(event)}
              aria-describedby="import-file-hint"
              className="w-full min-w-0 rounded-md border border-line-control bg-surface text-sm text-fg shadow-soft file:mr-4 file:h-11 file:cursor-pointer file:border-0 file:bg-primary-soft file:px-4 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            <p id="import-file-hint" className="text-xs text-fg-muted">
              La prima riga contiene i nomi delle colonne: nome e cognome sono obbligatori. Colonne utili: dataNascita,
              codiceFiscale, email, telefono, squadre (più squadre separate da «|»), ruolo, taglia. Massimo 1.000 righe.
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
                <li className="text-fg-muted">{preview.totalRows} righe lette</li>
                <li className="flex items-center gap-1.5 font-semibold text-success">
                  <CircleCheck aria-hidden="true" className="size-4" />
                  {preview.validRows} valide
                </li>
                <li
                  className={
                    preview.invalidRows > 0 ? "flex items-center gap-1.5 font-semibold text-danger" : "text-fg-muted"
                  }
                >
                  {preview.invalidRows > 0 ? <CircleAlert aria-hidden="true" className="size-4" /> : null}
                  {preview.invalidRows} con errori
                </li>
              </ul>
              {preview.ignoredColumns.length > 0 ? (
                <Alert tone="info">Colonne non riconosciute e ignorate: {preview.ignoredColumns.join(", ")}.</Alert>
              ) : null}
              {preview.invalidRows > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-fg-muted">
                    Le righe con errori non verranno importate. Correggile nel file e ricaricalo, oppure importa solo
                    quelle valide.
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
