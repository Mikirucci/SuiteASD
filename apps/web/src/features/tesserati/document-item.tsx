"use client";

import { Download, Eye, Paperclip } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FilePreviewDialog } from "@/components/ui/file-preview-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { describeError } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { useDocumentFile, useDownloadDocument } from "./api";
import { describeExpiryLine, expiryTone, type ExpiryTone } from "./document-format";
import { DocumentStatusChip } from "./document-status-chip";
import type { DocumentStatus, MemberDocument } from "./types";

/** Colour sits on the text only (no pill): the words say the same thing, so colour is never the sole signal. */
const EXPIRY_TEXT_CLASSES: Record<ExpiryTone, string> = {
  danger: "font-semibold text-danger",
  warning: "font-semibold text-warning",
  neutral: "text-fg-muted",
};

export interface DocumentItemProps {
  /** Visible title: the document type, plus the free title when there is one. */
  heading: string;
  /** Name of the document type, used in the accessible names of the buttons ("Apri Certificato medico"). */
  typeName: string;
  status: DocumentStatus;
  expiresAt: string | null;
  daysRemaining: number | null;
  /** Second line when there is no expiry to show ("Non ancora consegnato", "Rilasciato il ..."). */
  note: string;
  /** The record with its file: gives the file line and the open and download actions. Absent for a missing document. */
  document?: MemberDocument;
  /** Actions of the screen (upload, edit, delete...), placed after open and download. */
  actions?: ReactNode;
}

function FileLine({ document }: { document: MemberDocument }) {
  if (!document.hasFile || !document.fileName) {
    return <p className="mt-1 text-xs text-fg-muted">Nessun file allegato</p>;
  }
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
      <Paperclip aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 break-words">
        {document.fileName}
        {document.sizeBytes ? ` · ${formatFileSize(document.sizeBytes)}` : ""}
      </span>
    </p>
  );
}

function FileActions({ document, heading, typeName }: { document: MemberDocument; heading: string; typeName: string }) {
  const { toast } = useToast();
  const download = useDownloadDocument();
  const load = useDocumentFile(document.downloadUrl ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!document.downloadUrl) return null;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Eye />}
        aria-label={`Apri ${typeName}`}
        onClick={() => setPreviewOpen(true)}
      >
        Apri
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Download />}
        loading={download.isPending}
        aria-label={`Scarica ${typeName}`}
        onClick={() =>
          download.mutate(document, {
            onError: (error) => toast({ title: "Download non riuscito", description: describeError(error), tone: "danger" }),
          })
        }
      >
        Scarica
      </Button>
      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={heading}
        fileName={document.fileName ?? "documento"}
        mimeType={document.mimeType}
        load={load}
      />
    </>
  );
}

/**
 * One document of a member, the same on the admin card and in the personal area: title, status chip, expiry in
 * coloured text, a quiet file line, then open and download followed by the actions the screen allows.
 */
export function DocumentItem({
  heading,
  typeName,
  status,
  expiresAt,
  daysRemaining,
  note,
  document,
  actions,
}: DocumentItemProps) {
  const hasExpiry = expiresAt !== null;
  const tone: ExpiryTone = hasExpiry ? expiryTone(daysRemaining) : "neutral";
  const hasActions = Boolean(document?.downloadUrl) || Boolean(actions);
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-fg">{heading}</p>
          <p className={cn("mt-1 text-sm", EXPIRY_TEXT_CLASSES[tone])}>
            {hasExpiry ? describeExpiryLine(expiresAt, daysRemaining) : note}
          </p>
          {document ? <FileLine document={document} /> : null}
        </div>
        <DocumentStatusChip status={status} />
      </div>
      {hasActions ? (
        <div className="flex flex-wrap gap-2">
          {document ? <FileActions document={document} heading={heading} typeName={typeName} /> : null}
          {actions}
        </div>
      ) : null}
    </li>
  );
}
