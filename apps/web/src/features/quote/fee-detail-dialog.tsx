"use client";

import { FileDown, HandCoins } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AutoChip, Button, Dialog, DialogContent, useToast } from "@/components/ui";
import { describeError, useApiMutation } from "@/lib/api";
import { FeeStatusChip } from "./fee-row";
import { formatDateTime, formatDay, formatEuro } from "@/lib/format";
import { METHOD_LABELS } from "./format";
import { saveFile } from "@/lib/save-file";
import type { Fee } from "./types";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-fg">{children}</dd>
    </>
  );
}

function reminderText(fee: Fee): string {
  if (fee.reminderCount === 0) return "Nessuno ancora";
  const last = fee.lastReminderAt ? `, ultimo il ${formatDateTime(fee.lastReminderAt)}` : "";
  return `${fee.reminderCount}${last}`;
}

export interface FeeDetailDialogProps {
  fee: Fee | null;
  onClose: () => void;
  /** Set only for users who may register payments. */
  onPay?: (fee: Fee) => void;
}

/** Fee card: amounts, dates, who paid and the numbered receipt, which can be downloaded as a PDF. */
export function FeeDetailDialog({ fee, onClose, onPay }: FeeDetailDialogProps) {
  const { toast } = useToast();
  const download = useApiMutation(
    async (target: Fee, client) => {
      const file = await client.download(`/fees/${target.id}/receipt`);
      saveFile(file, `ricevuta-${target.receipt?.code ?? target.id}.pdf`);
    },
    { onSuccess: () => toast({ title: "Ricevuta scaricata", tone: "success" }) },
  );

  if (!fee) return null;
  const settled = fee.status === "PAID";
  const canPay = onPay !== undefined && (fee.status === "PENDING" || fee.status === "OVERDUE");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={fee.memberName}
        description={`${fee.description} · ${formatEuro(fee.amountCents)}`}
        footer={
          <>
            {fee.receipt ? (
              <Button variant="secondary" leftIcon={<FileDown />} loading={download.isPending} onClick={() => download.mutate(fee)}>
                Scarica ricevuta
              </Button>
            ) : null}
            {canPay ? (
              <Button leftIcon={<HandCoins />} onClick={() => onPay(fee)}>
                Registra pagamento
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {download.error ? <Alert tone="danger">{describeError(download.error)}</Alert> : null}
          <dl className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-sm">
            <Detail label="Stato">
              <FeeStatusChip fee={fee} />
            </Detail>
            <Detail label="Scadenza">{formatDay(fee.dueDate)}</Detail>
            {fee.teams.length > 0 ? <Detail label="Squadra">{fee.teams.map((team) => team.name).join(", ")}</Detail> : null}
            {settled && fee.paidAt ? <Detail label="Pagata il">{formatDateTime(fee.paidAt)}</Detail> : null}
            {settled && fee.method ? <Detail label="Metodo">{METHOD_LABELS[fee.method]}</Detail> : null}
            {settled && fee.payerName ? <Detail label="Pagante">{fee.payerName}</Detail> : null}
            {settled && fee.reference ? <Detail label="Riferimento">{fee.reference}</Detail> : null}
            {fee.receipt ? (
              <Detail label="Ricevuta">
                <span className="flex flex-wrap items-center gap-2">
                  n. {fee.receipt.code}
                  <AutoChip>Emessa in automatico</AutoChip>
                </span>
              </Detail>
            ) : null}
            {!settled && fee.status !== "CANCELLED" ? (
              <Detail label="Promemoria">
                <span className="flex flex-wrap items-center gap-2">
                  {reminderText(fee)}
                  <AutoChip />
                </span>
              </Detail>
            ) : null}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
