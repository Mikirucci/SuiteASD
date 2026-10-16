"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, useToast } from "@/components/ui";
import { ApiError, describeError, useApiMutation } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { formatEuro, pluralize } from "@/lib/format";
import { generateSchema, toGenerateBody, type GenerateValues } from "./schemas";
import type { FeePlan, GenerateFeesBody, GenerateFeesResult } from "./types";

const FORM_ID = "generate-fees-form";

/** The next occurrence of the plan's due day (today when it has none or it is today). */
export function defaultDueDate(plan: FeePlan, now: Date = new Date()): string {
  if (plan.dueDay === null) return toDayKey(now);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), plan.dueDay);
  const upcoming = toDayKey(thisMonth) >= toDayKey(now) ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, plan.dueDay);
  return toDayKey(upcoming);
}

function GenerateForm({ plan, onDone }: { plan: FeePlan; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GenerateValues>({
    resolver: zodResolver(generateSchema),
    defaultValues: { dueDate: defaultDueDate(plan), description: "" },
  });

  const generate = useApiMutation(
    (body: GenerateFeesBody, client) => client.post<GenerateFeesResult>(`/fee-plans/${plan.id}/generate`, body),
    {
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ["fees"] }),
          queryClient.invalidateQueries({ queryKey: ["fees-summary"] }),
        ]),
    },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { created, skipped } = await generate.mutateAsync(toGenerateBody(values));
      const already = skipped > 0 ? ` ${pluralize(skipped, "tesserato la aveva già", "tesserati la avevano già")}.` : "";
      toast(
        created > 0
          ? { title: `${pluralize(created, "quota creata", "quote create")}`, description: `${plan.name}.${already}`, tone: "success" }
          : { title: "Nessuna nuova quota", description: `Tutti i tesserati hanno già questa quota per la data scelta.`, tone: "info" },
      );
      onDone();
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.code === "fee_plan_inactive"
          ? "Il piano non è attivo. Attivalo dalla modifica del piano e riprova."
          : describeError(error),
      );
    }
  });

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Input label="Scadenza delle quote" type="date" required error={errors.dueDate?.message} {...register("dueDate")} />
        <Input
          label="Descrizione"
          hint={`Facoltativa. Se la lasci vuota usiamo “${plan.name}”.`}
          error={errors.description?.message}
          {...register("description")}
        />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<Users />} loading={isSubmitting}>
          Genera le quote
        </Button>
      </div>
    </>
  );
}

export interface GenerateFeesDialogProps {
  plan: FeePlan | null;
  onClose: () => void;
}

/** Creates one fee per active member of the plan's target group; members that already have it are skipped. */
export function GenerateFeesDialog({ plan, onClose }: GenerateFeesDialogProps) {
  if (!plan) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Genera le quote"
        description={`${plan.name} · ${formatEuro(plan.amountCents)} per ogni tesserato attivo del gruppo del piano.`}
      >
        <GenerateForm key={plan.id} plan={plan} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}
