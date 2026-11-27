"use client";

import { ShieldCheck } from "lucide-react";
import { Button, DataList, Dialog, DialogClose, DialogContent, EmptyState, LoadMore } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useDocumentAccesses } from "./api";

interface FileAccessesDialogProps {
  documentId: string;
  /** The document as the row shows it ("Certificato medico · agonistico"). */
  heading: string;
  onClose: () => void;
}

/**
 * Who opened the file of a document, or tried to, newest first. The files are medical certificates (health data), so
 * the administrator can always answer "who saw it"; a line is kept six months.
 */
export function FileAccessesDialog({ documentId, heading, onClose }: FileAccessesDialogProps) {
  const accesses = useDocumentAccesses(documentId);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Chi ha aperto il file"
        description={`${heading} · ultimi sei mesi`}
        scrollable
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Chiudi</Button>
          </DialogClose>
        }
      >
        <div className="flex flex-col gap-3">
          <DataList
            label="Accessi al file"
            items={accesses.items}
            getKey={(access) => access.id}
            isLoading={accesses.isLoading}
            error={accesses.error}
            onRetry={accesses.refetch}
            loadingLabel="Caricamento degli accessi"
            skeletonRows={3}
            empty={
              <EmptyState
                icon={ShieldCheck}
                title="Nessun accesso"
                description="Negli ultimi sei mesi nessuno ha aperto o scaricato questo file."
              />
            }
            renderItem={(access) => (
              <div className="flex flex-col gap-0.5 p-4">
                <p className="text-sm font-bold text-fg">{access.userName ?? "Un account che non è più nella società"}</p>
                <p className={access.granted ? "text-sm text-fg" : "text-sm font-semibold text-danger"}>
                  {access.granted ? "File aperto" : "Accesso negato"}
                </p>
                <p className="text-xs text-fg-muted">{formatDateTime(access.createdAt)}</p>
              </div>
            )}
          />
          <LoadMore list={accesses} noun="Accessi" moreLabel="Carica altri accessi" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
