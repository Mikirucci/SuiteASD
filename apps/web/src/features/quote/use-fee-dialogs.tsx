"use client";

import { useState, type ReactNode } from "react";
import { useToast } from "@/components/ui";
import { ClaimPaymentDialog } from "./claim-payment-dialog";
import { FeeDetailDialog } from "./fee-detail-dialog";
import { PayFeeDialog } from "./pay-fee-dialog";
import type { Fee } from "./types";

export interface FeeDialogs {
  openDetail: (fee: Fee) => void;
  startPay: (fee: Fee) => void;
  startClaim: (fee: Fee) => void;
  /** The dialogs themselves: render them once, next to the list that opens them. */
  dialogs: ReactNode;
}

/**
 * The three dialogs of a single fee (card, "Ho pagato", register payment) and how they hand over to each other:
 * paying from the card closes the card, and a registered payment reopens it with the receipt.
 */
export function useFeeDialogs({ viewer, canWrite }: { viewer: "payer" | "secretariat"; canWrite: boolean }): FeeDialogs {
  const { toast } = useToast();
  const [detail, setDetail] = useState<Fee | null>(null);
  const [detailJustPaid, setDetailJustPaid] = useState(false);
  const [paying, setPaying] = useState<Fee | null>(null);
  const [claiming, setClaiming] = useState<Fee | null>(null);

  const openDetail = (fee: Fee, justPaid = false) => {
    setDetailJustPaid(justPaid);
    setDetail(fee);
  };

  const dialogs = (
    <>
      <FeeDetailDialog
        fee={detail}
        viewer={viewer}
        justPaid={detailJustPaid}
        onClose={() => setDetail(null)}
        onPay={
          canWrite
            ? (fee) => {
                setDetail(null);
                setPaying(fee);
              }
            : undefined
        }
      />
      <ClaimPaymentDialog fee={claiming} onClose={() => setClaiming(null)} />
      <PayFeeDialog
        fee={paying}
        onClose={() => setPaying(null)}
        onPaid={(paid) => {
          setPaying(null);
          openDetail(paid, true);
          toast({
            title: "Pagamento registrato",
            description: paid.receipt ? `Ricevuta n. ${paid.receipt.code} emessa per ${paid.memberName}.` : paid.memberName,
            tone: "success",
          });
        }}
      />
    </>
  );

  return { openDetail: (fee) => openDetail(fee), startPay: setPaying, startClaim: setClaiming, dialogs };
}
