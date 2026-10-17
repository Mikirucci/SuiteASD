"use client";

import { Download, Eye } from "lucide-react";
import { useState } from "react";
import { Button, FilePreviewDialog, useToast } from "@/components/ui";
import { api, describeError, useApiMutation } from "@/lib/api";
import { saveFile } from "@/lib/save-file";
import type { Receipt } from "./types";

export interface ReceiptActionsProps {
  feeId: string;
  receipt: Receipt;
  /**
   * "row" sits in the list: short visible labels, the receipt number in the accessible names so that every row is
   * told apart. "card" sits in the fee card, where the fee is already named.
   */
  variant: "row" | "card";
  /** Italian message of a failed download; the caller decides where it is shown (a toast is hidden behind a dialog). */
  onError: (message: string) => void;
}

/** Look at the numbered receipt inside the platform, or save the PDF. Both fetch it with the Bearer token. */
export function ReceiptActions({ feeId, receipt, variant, onError }: ReceiptActionsProps) {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const path = `/fees/${feeId}/receipt`;
  const fileName = `ricevuta-${receipt.code}.pdf`;
  const row = variant === "row";

  const download = useApiMutation(
    async (target: string, client) => {
      saveFile(await client.download(target), fileName);
    },
    {
      onSuccess: () => toast({ title: "Ricevuta scaricata", tone: "success" }),
      onError: (error) => onError(describeError(error)),
    },
  );

  return (
    <>
      <Button
        variant="secondary"
        leftIcon={<Eye />}
        aria-label={row ? `Vedi ricevuta n. ${receipt.code}` : undefined}
        onClick={() => setPreviewOpen(true)}
      >
        Vedi ricevuta
      </Button>
      <Button
        variant={row ? "ghost" : "secondary"}
        leftIcon={<Download />}
        loading={download.isPending}
        aria-label={row ? `Scarica ricevuta n. ${receipt.code}` : undefined}
        onClick={() => download.mutate(path)}
      >
        {row ? "Scarica" : "Scarica ricevuta"}
      </Button>
      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Ricevuta n. ${receipt.code}`}
        fileName={fileName}
        mimeType="application/pdf"
        load={() => api.download(path)}
      />
    </>
  );
}
