"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Switch, useToast } from "@/components/ui";
import { ApiError, useApiMutation } from "@/lib/api";
import { configFieldsOf, configFormSchema, toConfigBody, toFormValues, type ConfigFormValues } from "./config";
import { describeAutomationError } from "./format";
import type { Automation, AutomationPatch } from "./types";

const FORM_ID = "automation-config-form";

interface ConfigFormProps {
  automation: Automation;
  onDone: () => void;
}

function ConfigForm({ automation, onDone }: ConfigFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const fields = useMemo(() => configFieldsOf(automation.key), [automation.key]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema(fields)),
    defaultValues: toFormValues(fields, automation.config),
  });

  const save = useApiMutation((patch: AutomationPatch, client) => client.patch<Automation>(`/automations/${automation.key}`, patch), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync({ config: toConfigBody(fields, values) });
      toast({ title: "Impostazioni salvate", description: automation.name, tone: "success" });
      onDone();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          const name = fieldError.path.split(".").pop() ?? "";
          if (fields.some((field) => field.name === name)) setError(name, { message: "Valore non valido" });
        }
      }
      setFormError(describeAutomationError(error));
    }
  });

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {fields.map((field) =>
          field.type === "toggle" ? (
            <Switch key={field.name} label={field.label} hint={field.hint} {...register(field.name)} />
          ) : (
            <Input
              key={field.name}
              label={field.label}
              required={field.type === "number"}
              inputMode={field.type === "days" ? "text" : "numeric"}
              autoComplete="off"
              hint={field.hint}
              error={errors[field.name]?.message}
              {...register(field.name)}
            />
          ),
        )}
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          Salva le impostazioni
        </Button>
      </div>
    </>
  );
}

export interface ConfigDialogProps {
  automation: Automation | null;
  onClose: () => void;
}

/** Settings of one automation (thresholds, days, limits). The schedule is fixed by the backend and is not editable. */
export function ConfigDialog({ automation, onClose }: ConfigDialogProps) {
  if (!automation) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`Impostazioni: ${automation.name}`} description="Le modifiche valgono dalla prossima esecuzione.">
        <ConfigForm key={automation.key} automation={automation} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}
