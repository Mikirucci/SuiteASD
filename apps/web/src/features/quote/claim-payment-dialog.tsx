"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog, useToast } from "@/components/ui";
import { ApiError, describeError, useApiMutation } from "@/lib/api";
import { formatEuro } from "@/lib/format";
import type { Fee } from "./types";

function describeClaimError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "Questa quota risulta già pagata o annullata. Abbiamo aggiornato l'elenco.";
  }
  if (error instanceof ApiError && error.status === 404) {
    return "Non troviamo questa quota. Aggiorna la pagina e riprova.";
  }
  return describeError(error);
}

export interface ClaimPaymentDialogProps {
  /** The fee the payer says is paid; null keeps the dialog closed. */
  fee: Fee | null;
  onClose: () => void;
}

/**
 * "Ho pagato": asks before telling the society. Reporting changes nothing about the fee itself: the secretariat checks
 * the bank account and registers the payment, which is the only thing that makes the fee paid.
 */
export function ClaimPaymentDialog({ fee, onClose }: ClaimPaymentDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const refreshFees = () => queryClient.invalidateQueries({ queryKey: ["fees"] });

  const claim = useApiMutation((target: Fee, client) => client.post<Fee>(`/fees/${target.id}/claim-payment`), {
    onSuccess: async () => {
      await refreshFees();
      toast({
        title: "Segnalazione inviata",
        description: "La società controllerà il pagamento e lo registrerà.",
        tone: "success",
      });
      onClose();
    },
    onError: (failure) => {
      setError(describeClaimError(failure));
      // A conflict means the list is stale: show the fee as it is now
      if (failure instanceof ApiError && (failure.status === 409 || failure.status === 404)) void refreshFees();
    },
  });

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <ConfirmDialog
      open={fee !== null}
      onOpenChange={(open) => !open && close()}
      title="Segnala il pagamento"
      description={
        fee
          ? `${fee.description} · ${formatEuro(fee.amountCents)}. La società riceve un avviso e controlla il pagamento. La quota risulta pagata solo quando la segreteria lo registra.`
          : ""
      }
      confirmLabel="Sì, ho pagato"
      tone="primary"
      loading={claim.isPending}
      error={error}
      onConfirm={() => {
        if (!fee) return;
        setError(null);
        claim.mutate(fee);
      }}
    />
  );
}
