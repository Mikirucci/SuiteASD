"use client";

import { Download, FilePlus2, FileText, FileUp, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { describeError } from "@/lib/api";
import {
  useDeleteDocument,
  useDocumentTypes,
  useDownloadDocument,
  useMemberDocuments,
  useUploadDocumentFile,
} from "./api";
import { ConfirmDialog } from "./confirm-dialog";
import { DocumentFormDialog } from "./document-form-dialog";
import { DOCUMENT_ACCEPT, validateDocumentFile } from "./document-file";
import { describeExpiry, formatDateOnly, formatFileSize } from "./document-format";
import { DocumentStatusChip } from "./document-status-chip";
import type { DocumentIndicator, MemberDocument } from "./types";

interface DocumentRowProps {
  document: MemberDocument;
  canWrite: boolean;
  onEdit: (document: MemberDocument) => void;
  onDelete: (document: MemberDocument) => void;
}

function DocumentRow({ document, canWrite, onEdit, onDelete }: DocumentRowProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocumentFile();
  const download = useDownloadDocument();
  const name = document.documentType.name;
  const heading = document.title ? `${name} · ${document.title}` : name;

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = validateDocumentFile(file);
    if (problem) {
      toast({ title: "File non valido", description: problem, tone: "danger" });
      return;
    }
    upload.mutate(
      { documentId: document.id, file },
      {
        onSuccess: () => toast({ title: "File caricato", description: heading, tone: "success" }),
        onError: (error) =>
          toast({ title: "Caricamento non riuscito", description: describeError(error), tone: "danger" }),
      },
    );
  }

  function onDownload() {
    download.mutate(document, {
      onError: (error) => toast({ title: "Download non riuscito", description: describeError(error), tone: "danger" }),
    });
  }

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">{heading}</p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {document.expiresAt
              ? `Scade il ${formatDateOnly(document.expiresAt)}${document.daysRemaining === null ? "" : ` · ${describeExpiry(document.daysRemaining)}`}`
              : document.documentType.requiresExpiry
                ? "Senza data di scadenza"
                : document.issuedAt
                  ? `Rilasciato il ${formatDateOnly(document.issuedAt)}`
                  : "Nessuna scadenza"}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {document.hasFile && document.fileName
              ? `${document.fileName}${document.sizeBytes ? ` · ${formatFileSize(document.sizeBytes)}` : ""}`
              : "Nessun file allegato"}
          </p>
        </div>
        <DocumentStatusChip status={document.status} />
      </div>
      <div className="flex flex-wrap gap-2">
        {document.downloadUrl ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download />}
            loading={download.isPending}
            aria-label={`Scarica ${name}`}
            onClick={onDownload}
          >
            Scarica
          </Button>
        ) : null}
        {canWrite ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={DOCUMENT_ACCEPT}
              onChange={onFileChange}
              tabIndex={-1}
              aria-label={`File di ${heading}`}
              className="sr-only"
            />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<FileUp />}
              loading={upload.isPending}
              aria-label={`${document.hasFile ? "Sostituisci file" : "Carica file"} di ${name}`}
              onClick={() => inputRef.current?.click()}
            >
              {document.hasFile ? "Sostituisci file" : "Carica file"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Pencil />}
              aria-label={`Modifica ${name}`}
              onClick={() => onEdit(document)}
            >
              Modifica
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 />}
              aria-label={`Elimina ${name}`}
              onClick={() => onDelete(document)}
            >
              Elimina
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function MissingRow({
  indicator,
  canWrite,
  onAdd,
}: {
  indicator: DocumentIndicator;
  canWrite: boolean;
  onAdd: (typeId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-bold text-fg">{indicator.name}</p>
        <p className="mt-0.5 text-sm text-fg-muted">Non ancora consegnato</p>
      </div>
      <div className="flex items-center gap-2">
        <DocumentStatusChip status="MISSING" />
        {canWrite ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<FilePlus2 />}
            aria-label={`Aggiungi ${indicator.name}`}
            onClick={() => onAdd(indicator.documentTypeId)}
          >
            Aggiungi
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export interface MemberDocumentsProps {
  memberId: string;
  /** Required-document indicators of the member: the ones without a record are shown as missing. */
  indicators: readonly DocumentIndicator[];
  canWrite: boolean;
}

/** Documents of one member: status, expiry, file upload/download, add, edit and delete. */
export function MemberDocuments({ memberId, indicators, canWrite }: MemberDocumentsProps) {
  const { toast } = useToast();
  const documents = useMemberDocuments(memberId);
  const types = useDocumentTypes();
  const remove = useDeleteDocument();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MemberDocument | undefined>();
  const [presetTypeId, setPresetTypeId] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<MemberDocument | null>(null);

  const rows = useMemo(
    () =>
      [...(documents.data?.data ?? [])].sort(
        (a, b) =>
          a.documentType.name.localeCompare(b.documentType.name, "it") ||
          (b.expiresAt ?? "").localeCompare(a.expiresAt ?? ""),
      ),
    [documents.data],
  );
  const missing = indicators.filter((indicator) => indicator.status === "MISSING" && indicator.documentId === null);

  function openForm(document?: MemberDocument, typeId?: string) {
    setEditing(document);
    setPresetTypeId(typeId);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast({ title: "Documento eliminato", description: deleting.documentType.name, tone: "success" });
        setDeleting(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-title text-fg">Documenti</h2>
        {canWrite ? (
          <Button variant="secondary" size="sm" leftIcon={<FilePlus2 />} onClick={() => openForm()}>
            Aggiungi documento
          </Button>
        ) : null}
      </div>
      <DataBoundary
        isLoading={documents.isPending}
        error={documents.error}
        onRetry={() => void documents.refetch()}
        isEmpty={rows.length === 0 && missing.length === 0}
        skeletonRows={3}
        loadingLabel="Caricamento dei documenti"
        empty={
          <EmptyState
            icon={FileText}
            title="Nessun documento"
            description={
              canWrite ? "Aggiungi il certificato medico e i moduli firmati." : "Non ci sono documenti da mostrare."
            }
          />
        }
      >
        <ul aria-label="Documenti del tesserato" className="divide-y divide-line">
          {rows.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              canWrite={canWrite}
              onEdit={(target) => openForm(target)}
              onDelete={setDeleting}
            />
          ))}
          {missing.map((indicator) => (
            <MissingRow
              key={indicator.documentTypeId}
              indicator={indicator}
              canWrite={canWrite}
              onAdd={(typeId) => openForm(undefined, typeId)}
            />
          ))}
        </ul>
      </DataBoundary>

      {canWrite ? (
        <>
          <DocumentFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            memberId={memberId}
            types={types.data?.data ?? []}
            document={editing}
            presetTypeId={presetTypeId}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDeleting(null);
                remove.reset();
              }
            }}
            title={deleting ? `Eliminare ${deleting.documentType.name}?` : "Eliminare il documento?"}
            description="Il documento e il file allegato vengono cancellati. L'operazione non si può annullare."
            confirmLabel="Elimina documento"
            onConfirm={confirmDelete}
            loading={remove.isPending}
            error={remove.error ? describeError(remove.error) : null}
          />
        </>
      ) : null}
    </div>
  );
}
