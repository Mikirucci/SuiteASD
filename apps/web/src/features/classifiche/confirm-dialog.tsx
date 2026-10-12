"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  /** Italian message of the last failed attempt (use describeError). */
  error?: string | null;
  /** `danger` for deletions, `primary` for actions that cannot be undone but destroy nothing (e.g. publishing). */
  tone?: "danger" | "primary";
}

/** Asks before an irreversible action; the error of a failed attempt stays inside the dialog. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  error,
  tone = "danger",
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button variant={tone} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </DialogContent>
    </Dialog>
  );
}
