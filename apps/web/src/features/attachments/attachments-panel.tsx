"use client";

import { Download, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { Alert, Button, ConfirmDialog, DataBoundary, EmptyState, IconButton, Input, useToast } from "@/components/ui";
import { describeError } from "@/lib/api";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { UPLOAD_ACCEPT, validateUploadFile } from "@/lib/upload-file";
import {
  useAttachments,
  useDeleteAttachment,
  useDownloadAttachment,
  useUploadAttachment,
  type Attachment,
  type AttachmentEntityType,
} from "./api";

export interface AttachmentsPanelProps {
  entityType: AttachmentEntityType;
  entityId: string;
  /** Name of the record, used in the accessible labels ("Scarica Contratto di Palazzetto"). */
  recordName: string;
}

/** The files attached to one record: list, upload, download and delete. Only the managers of the record see it. */
export function AttachmentsPanel({ entityType, entityId, recordName }: AttachmentsPanelProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);

  const list = useAttachments(entityType, entityId);
  const upload = useUploadAttachment(entityType, entityId);
  const remove = useDeleteAttachment(entityType, entityId);
  const download = useDownloadAttachment();

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = validateUploadFile(file);
    setFileError(problem);
    if (problem) return;
    upload.mutate(
      { file, title },
      {
        onSuccess: () => {
          setTitle("");
          toast({ title: "File allegato", description: file.name, tone: "success" });
        },
        onError: (error) => setFileError(describeError(error)),
      },
    );
  }

  const attachments = list.data?.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label="Nome del documento"
          hint="Facoltativo, per riconoscerlo: ad esempio Contratto 2026."
          maxLength={120}
          autoComplete="off"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="sm:flex-1"
        />
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={onFileChange}
          tabIndex={-1}
          aria-label={`File da allegare a ${recordName}`}
          className="sr-only"
        />
        <Button leftIcon={<Upload />} loading={upload.isPending} onClick={() => inputRef.current?.click()}>
          Allega un file
        </Button>
      </div>
      <p className="text-xs text-fg-muted">PDF, JPG o PNG, fino a 5 MB.</p>
      {fileError ? <Alert tone="danger">{fileError}</Alert> : null}

      <DataBoundary
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        isEmpty={attachments?.length === 0}
        loadingLabel="Caricamento degli allegati"
        skeletonRows={2}
        empty={
          <EmptyState
            icon={Paperclip}
            title="Nessun allegato"
            description="Allega qui contratti, fatture, programmi o foto: restano legati a questa voce."
          />
        }
      >
        <ul aria-label={`Allegati di ${recordName}`} className="divide-y divide-line">
          {attachments?.map((attachment) => {
            const label = attachment.title ?? attachment.fileName;
            return (
              <li key={attachment.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <FileText aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold text-fg">{label}</p>
                  <p className="break-words text-xs text-fg-muted">
                    {attachment.title ? `${attachment.fileName} · ` : ""}
                    {formatFileSize(attachment.sizeBytes)} · {formatDateTime(attachment.createdAt)}
                  </p>
                </div>
                <IconButton
                  icon={<Download />}
                  aria-label={`Scarica ${label}`}
                  variant="secondary"
                  loading={download.isPending && download.variables?.id === attachment.id}
                  onClick={() =>
                    download.mutate(attachment, {
                      onError: (error) => toast({ title: "Download non riuscito", description: describeError(error), tone: "danger" }),
                    })
                  }
                />
                <IconButton
                  icon={<Trash2 />}
                  aria-label={`Elimina ${label}`}
                  variant="ghost"
                  onClick={() => {
                    remove.reset();
                    setDeleting(attachment);
                  }}
                />
              </li>
            );
          })}
        </ul>
      </DataBoundary>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Eliminare ${deleting.title ?? deleting.fileName}?` : ""}
        description="Il file viene cancellato dalla voce. L'azione non si può annullare."
        confirmLabel="Elimina"
        loading={remove.isPending}
        error={remove.error ? describeError(remove.error) : null}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting, {
            onSuccess: () => {
              toast({ title: "Allegato eliminato", description: deleting.title ?? deleting.fileName, tone: "success" });
              setDeleting(null);
            },
          });
        }}
      />
    </div>
  );
}
