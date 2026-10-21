"use client";

import { FilePlus2, FileText, FileUp, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { DataBoundary } from "@/components/ui/data-boundary";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { describeError } from "@/lib/api";
import { useDeleteDocument, useDocumentTypes, useMemberDocuments, useUploadDocumentFile } from "./api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocumentFormDialog } from "./document-form-dialog";
import { UPLOAD_ACCEPT, validateUploadFile } from "@/lib/upload-file";
import { documentHeading, formatDateOnly } from "./document-format";
import { DocumentItem } from "./document-item";
import type { DocumentIndicator, MemberDocument } from "./types";

interface DocumentRowProps {
  document: MemberDocument;
  canWrite: boolean;
  onEdit: (document: MemberDocument) => void;
  onDelete: (document: MemberDocument) => void;
}

function noExpiryNote(document: MemberDocument): string {
  if (!document.hasFile) return "File non ancora caricato";
  if (document.documentType.requiresExpiry) return "Senza data di scadenza";
  return document.issuedAt ? `Rilasciato il ${formatDateOnly(document.issuedAt)}` : "Nessuna scadenza";
}

function DocumentRow({ document, canWrite, onEdit, onDelete }: DocumentRowProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocumentFile();
  const name = document.documentType.name;
  const heading = documentHeading(name, document.title);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = validateUploadFile(file);
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

  const pickFile = () => inputRef.current?.click();

  // Without a file the one thing to do is to upload it; once it is there, "Apri" leads and the rest sits in the menu
  return (
    <DocumentItem
      heading={heading}
      typeName={name}
      status={document.status}
      expiresAt={document.expiresAt}
      daysRemaining={document.daysRemaining}
      note={noExpiryNote(document)}
      document={document}
      actions={
        canWrite && !document.hasFile ? (
          <Button variant="secondary" size="sm" leftIcon={<FileUp />} loading={upload.isPending} aria-label={`Carica file di ${name}`} onClick={pickFile}>
            Carica file
          </Button>
        ) : null
      }
      menuItems={
        canWrite ? (
          <>
            {document.hasFile ? (
              <DropdownMenuItem icon={<FileUp />} aria-label={`Sostituisci file di ${name}`} onSelect={pickFile}>
                Sostituisci file
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem icon={<Pencil />} aria-label={`Modifica ${name}`} onSelect={() => onEdit(document)}>
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Trash2 />} tone="danger" aria-label={`Elimina ${name}`} onSelect={() => onDelete(document)}>
              Elimina
            </DropdownMenuItem>
          </>
        ) : null
      }
      aside={
        canWrite ? (
          <input
            ref={inputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={onFileChange}
            tabIndex={-1}
            aria-label={`File di ${heading}`}
            className="sr-only"
          />
        ) : null
      }
    />
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
    <DocumentItem
      heading={indicator.name}
      typeName={indicator.name}
      status="MISSING"
      expiresAt={null}
      daysRemaining={null}
      note="Non ancora consegnato"
      actions={
        canWrite ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<FilePlus2 />}
            aria-label={`Aggiungi ${indicator.name}`}
            onClick={() => onAdd(indicator.documentTypeId)}
          >
            Aggiungi
          </Button>
        ) : null
      }
    />
  );
}

export interface MemberDocumentsProps {
  memberId: string;
  /** Required-document indicators of the member: the ones without a record are shown as missing. */
  indicators: readonly DocumentIndicator[];
  canWrite: boolean;
}

/**
 * Documents of one member: status, expiry, file preview/download/upload, edit and delete. Each row puts forward one action
 * ("Apri", or "Carica file" while the file is missing) and keeps the others in a menu. The general "add" button exists
 * only in the empty state: once there are rows (even missing ones) each row carries its own actions.
 */
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
      <h2 className="text-base font-bold tracking-title text-fg">Documenti</h2>
      <DataBoundary
        isLoading={documents.isPending}
        error={documents.error}
        onRetry={() => void documents.refetch()}
        isEmpty={rows.length === 0 && missing.length === 0}
        skeletonRows={3}
        loadingLabel="Caricamento dei documenti"
        empty={
          <EmptyState
            className="shadow-none"
            icon={FileText}
            title="Nessun documento"
            description={
              canWrite ? "Aggiungi il certificato medico e i moduli firmati." : "Non ci sono documenti da mostrare."
            }
            action={
              canWrite ? (
                <Button variant="secondary" leftIcon={<FilePlus2 />} onClick={() => openForm()}>
                  Aggiungi documento
                </Button>
              ) : undefined
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
