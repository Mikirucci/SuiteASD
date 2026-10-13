"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, useToast } from "@/components/ui";
import { centsToInput } from "@/features/quote/format";
import { useApiMutation } from "@/lib/api";
import { describeRefereeError } from "./messages";
import { feeFormSchema, toFeeBody, type FeeFormValues } from "./schemas";
import type { Assignment } from "./types";

const FORM_ID = "assignment-fee-form";

function FeeForm({ assignment, onDone }: { assignment: Assignment; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FeeFormValues>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: { fee: assignment.feeCents === null ? "" : centsToInput(assignment.feeCents) },
  });

  const save = useApiMutation(
    (values: FeeFormValues, client) => client.patch<Assignment>(`/referee-assignments/${assignment.id}`, toFeeBody(values)),
    { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referee-assignments"] }) },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync(values);
      toast({ title: "Compenso aggiornato", description: assignment.refereeName, tone: "success" });
      onDone();
    } catch (error) {
      setFormError(describeRefereeError(error));
    }
  });

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Input
          label="Compenso in euro"
          inputMode="decimal"
          autoComplete="off"
          hint="Lascia vuoto se non c'è un compenso."
          error={errors.fee?.message}
          {...register("fee")}
        />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          Salva il compenso
        </Button>
      </div>
    </>
  );
}

export interface FeeDialogProps {
  assignment: Assignment | null;
  onClose: () => void;
}

export function FeeDialog({ assignment, onClose }: FeeDialogProps) {
  if (!assignment) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Compenso di ${assignment.refereeName}`}
        description={`${assignment.match.homeTeam} - ${assignment.match.awayTeam}`}
      >
        <FeeForm key={assignment.id} assignment={assignment} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}
