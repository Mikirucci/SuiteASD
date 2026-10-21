"use client";

import { Download, Eye, MoreHorizontal, Paperclip } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  /** The record with its file: gives the file line, "Apri" and the download. Absent for a missing document. */
  document?: MemberDocument;
  /** The one action the screen puts forward (upload, add...), next to "Apri". */
  actions?: ReactNode;
  /** The other actions of the screen (replace the file, edit, delete...) as menu items, after the download. */
  menuItems?: ReactNode;
  /** Invisible parts of the row that must outlive the menu, such as the file input behind "Carica file". */
  aside?: ReactNode;
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

/**
 * "Apri" shows the file in the platform, then the action the screen puts forward (`children`), then the menu with the
 * download and every other action: a row never shows a wall of buttons.
 */
function FileActions({
  document,
  heading,
  typeName,
  menuItems,
  children,
}: {
  document: MemberDocument;
  heading: string;
  typeName: string;
  menuItems: ReactNode;
  children: ReactNode;
}) {
  const { toast } = useToast();
  const download = useDownloadDocument();
  const load = useDocumentFile(document.downloadUrl ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" leftIcon={<Eye />} aria-label={`Apri ${typeName}`} onClick={() => setPreviewOpen(true)}>
        Apri
      </Button>
      {children}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton size="sm" aria-label={`Altre azioni di ${typeName}`} icon={<MoreHorizontal />} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            icon={<Download />}
            aria-label={`Scarica ${typeName}`}
            onSelect={() =>
              download.mutate(document, {
                onError: (error) => toast({ title: "Download non riuscito", description: describeError(error), tone: "danger" }),
              })
            }
          >
            Scarica
          </DropdownMenuItem>
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>
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

/** Menu of a row that has no file to open: only the actions the screen puts there (edit, delete...). */
function ActionsMenu({ typeName, children }: { typeName: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton size="sm" aria-label={`Altre azioni di ${typeName}`} icon={<MoreHorizontal />} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One document of a member, the same on the admin card and in the personal area: title, status chip, expiry in
 * coloured text, a quiet file line, then "Apri", the action the screen puts forward and a menu with the rest.
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
  menuItems,
  aside,
}: DocumentItemProps) {
  // A document that is missing (or whose file has not arrived) has no valid expiry to put forward
  const hasExpiry = expiresAt !== null && status !== "MISSING";
  const tone: ExpiryTone = hasExpiry ? expiryTone(daysRemaining) : "neutral";
  const hasFileActions = Boolean(document?.downloadUrl);
  const hasActions = hasFileActions || Boolean(actions) || Boolean(menuItems);
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
        <div className="flex flex-wrap items-center gap-2">
          {document && hasFileActions ? (
            <FileActions document={document} heading={heading} typeName={typeName} menuItems={menuItems}>
              {actions}
            </FileActions>
          ) : (
            <>
              {actions}
              {menuItems ? <ActionsMenu typeName={typeName}>{menuItems}</ActionsMenu> : null}
            </>
          )}
        </div>
      ) : null}
      {aside}
    </li>
  );
}
