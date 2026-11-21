"use client";

import { FileText, Upload, X } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent } from "react";
import { Alert, Button, IconButton } from "@/components/ui";
import { formatFileSize } from "@/lib/format";
import { UPLOAD_ACCEPT, validateUploadFile } from "@/lib/upload-file";

export interface NewRecordFilesProps {
  files: readonly File[];
  onChange: (files: File[]) => void;
}

/** The files to attach to a record that does not exist yet: they are chosen here and sent once the record is saved. */
export function NewRecordFiles({ files, onChange }: NewRecordFilesProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const noteId = useId();
  const [problems, setProblems] = useState<string[]>([]);

  function onFilesChosen(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of chosen) {
      const problem = validateUploadFile(file);
      if (problem) rejected.push(`${file.name}: ${problem}`);
      else accepted.push(file);
    }
    setProblems(rejected);
    if (accepted.length > 0) onChange([...files, ...accepted]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-bold text-fg">Allegati</span>
          <span id={noteId} className="text-xs text-fg-muted">
            Facoltativi: fatture, scontrini, foto. PDF, JPG o PNG, fino a 5 MB ciascuno.
          </span>
        </div>
        <input ref={inputRef} type="file" multiple accept={UPLOAD_ACCEPT} onChange={onFilesChosen} tabIndex={-1} aria-label="File da allegare" aria-describedby={noteId} className="sr-only" />
        <Button variant="secondary" size="sm" leftIcon={<Upload />} onClick={() => inputRef.current?.click()}>
          Aggiungi file
        </Button>
      </div>
      {problems.length > 0 ? (
        <Alert tone="danger">
          {problems.map((problem) => (
            <span key={problem} className="block">
              {problem}
            </span>
          ))}
        </Alert>
      ) : null}
      {files.length > 0 ? (
        <ul aria-label="File scelti" className="divide-y divide-line rounded-md border border-line">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-3 py-2">
              <FileText aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-fg">{file.name}</p>
                <p className="text-xs text-fg-muted">{formatFileSize(file.size)}</p>
              </div>
              <IconButton size="sm" aria-label={`Togli ${file.name}`} icon={<X />} onClick={() => onChange(files.filter((_, position) => position !== index))} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
