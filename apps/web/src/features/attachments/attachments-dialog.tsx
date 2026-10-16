"use client";

import { Dialog, DialogClose, DialogContent, Button } from "@/components/ui";
import { AttachmentsPanel } from "./attachments-panel";
import type { AttachmentEntityType } from "./api";

export interface AttachmentsTarget {
  entityType: AttachmentEntityType;
  entityId: string;
  recordName: string;
}

export interface AttachmentsDialogProps {
  target: AttachmentsTarget | null;
  onClose: () => void;
}

/** The attachments of one record in a dialog, opened from the row of the record. */
export function AttachmentsDialog({ target, onClose }: AttachmentsDialogProps) {
  if (!target) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg"
        title={`Allegati · ${target.recordName}`}
        description="Contratti, fatture, programmi e foto collegati a questa voce."
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Chiudi</Button>
          </DialogClose>
        }
      >
        <AttachmentsPanel key={target.entityId} {...target} />
      </DialogContent>
    </Dialog>
  );
}
