"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select } from "@/components/ui";
import { ApiError, describeError, useApiMutation } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { formatEuro } from "@/lib/format";
import { METHOD_OPTIONS } from "./format";
import { createPaySchema, toPayBody, type PayValues } from "./schemas";
import type { Fee, PayFeeBody } from "./types";
import { useIdempotencyKey } from "./use-idempotency-key";

const FORM_ID = "pay-fee-form";

/** API field -> form field (the date travels as `paidAt`). */
const FIELD_OF_API_PATH: Record<string, Path<PayValues>> = {
  method: "method",
  paidAt: "paidDate",
  payerName: "payerName",
  payerEmail: "payerEmail",
  reference: "reference",
};

interface PayFeeFormProps {
  fee: Fee;
  onPaid: (fee: Fee) => void;
}

function PayFeeForm({ fee, onPaid }: PayFeeFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const today = toDayKey(new Date());
  const schema = useMemo(() => createPaySchema(today), [today]);
  const keyFor = useIdempotencyKey();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PayValues>({
    resolver: zodResolver(schema),
    defaultValues: { method: "CASH", paidDate: today, payerName: "", payerEmail: "", reference: "" },
  });

  const refreshFees = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fees"] }),
      queryClient.invalidateQueries({ queryKey: ["fees-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["fee-plans"] }),
    ]);

  const pay = useApiMutation(
    ({ body, key }: { body: PayFeeBody; key: string }, client) =>
      client.post<Fee>(`/fees/${fee.id}/pay`, body, { idempotencyKey: key }),
    { onSuccess: refreshFees },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const body = toPayBody(values, today);
    try {
      onPaid(await pay.mutateAsync({ body, key: keyFor(JSON.stringify(body)) }));
    } catch (error) {
      if (error instanceof ApiError && error.code === "fee_already_paid") {
        setFormError("Questa quota risulta già pagata. Chiudi la finestra: l'elenco è stato aggiornato.");
        await refreshFees();
        return;
      }
      if (error instanceof ApiError && error.code === "paid_at_in_future") {
        setError("paidDate", { message: "La data del pagamento non può essere futura" });
        return;
      }
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          const field = FIELD_OF_API_PATH[fieldError.path.split(".").pop() ?? ""];
          if (field) setError(field, { message: "Valore non valido" });
        }
      }
      setFormError(describeError(error));
    }
  });

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Metodo di pagamento" options={METHOD_OPTIONS} error={errors.method?.message} {...register("method")} />
          <Input
            label="Data del pagamento"
            type="date"
            max={today}
            required
            error={errors.paidDate?.message}
            {...register("paidDate")}
          />
        </div>
        <Input
          label="Nome del pagante"
          autoComplete="off"
          hint="Se lo lasci vuoto usiamo il nome del tesserato."
          error={errors.payerName?.message}
          {...register("payerName")}
        />
        <Input
          label="Email del pagante"
          type="email"
          inputMode="email"
          autoComplete="off"
          hint="Se lo lasci vuoto usiamo l'email del tesserato."
          error={errors.payerEmail?.message}
          {...register("payerEmail")}
        />
        <Input
          label="Riferimento"
          autoComplete="off"
          hint="Per esempio il CRO del bonifico."
          error={errors.reference?.message}
          {...register("reference")}
        />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<HandCoins />} loading={isSubmitting}>
          Conferma pagamento
        </Button>
      </div>
    </>
  );
}

export interface PayFeeDialogProps {
  /** The fee to settle; null keeps the dialog closed. */
  fee: Fee | null;
  onClose: () => void;
  onPaid: (fee: Fee) => void;
}

/** Registers a manual payment (cash, bank transfer, card) and issues the numbered receipt. */
export function PayFeeDialog({ fee, onClose, onPaid }: PayFeeDialogProps) {
  if (!fee) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Registra pagamento"
        description={`${fee.memberName} · ${fee.description} · ${formatEuro(fee.amountCents)}`}
      >
        {/* Keyed by fee: every dialog opening starts a new payment attempt with a new Idempotency-Key */}
        <PayFeeForm key={fee.id} fee={fee} onPaid={onPaid} />
      </DialogContent>
    </Dialog>
  );
}
