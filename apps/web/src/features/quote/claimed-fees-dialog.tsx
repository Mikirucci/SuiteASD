"use client";

import { Dialog, DialogContent, DataList, EmptyState, LoadMore } from "@/components/ui";
import { BellRing } from "lucide-react";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { FeeRow } from "./fee-row";
import { useFeeDialogs } from "./use-fee-dialogs";
import type { Fee } from "./types";

function ClaimedFeesContent({ canWrite }: { canWrite: boolean }) {
  const fees = useCursorQuery<Fee>(["fees", "claimed-list"], "/fees", { claimed: true, limit: 25 });
  const { openDetail, startPay, dialogs } = useFeeDialogs({ viewer: "secretariat", canWrite });
  return (
    <DialogContent
      className="max-w-2xl"
      title="Pagamenti segnalati"
      description="Controlla il conto e registra i pagamenti: la ricevuta parte da sola."
    >
      <div className="flex flex-col gap-3">
        <DataList
          label="Quote segnalate"
          items={fees.items}
          getKey={(fee) => fee.id}
          renderItem={(fee) => <FeeRow fee={fee} viewer="secretariat" onOpen={openDetail} onPay={canWrite ? startPay : undefined} />}
          isLoading={fees.isLoading}
          error={fees.error}
          onRetry={fees.refetch}
          loadingLabel="Caricamento delle quote segnalate"
          empty={<EmptyState className="shadow-none" icon={BellRing} title="Nessuna quota segnalata" description="Le segnalazioni già controllate non compaiono più qui." />}
        />
        <LoadMore list={fees} noun="Quote" moreLabel="Mostra altre quote" />
      </div>
      {dialogs}
    </DialogContent>
  );
}

export interface ClaimedFeesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
}

/** The fees the payers reported as paid, waiting for the secretariat to check the bank account. */
export function ClaimedFeesDialog({ open, onOpenChange, canWrite }: ClaimedFeesDialogProps) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <ClaimedFeesContent canWrite={canWrite} />
    </Dialog>
  );
}
