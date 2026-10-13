"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useId, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, Textarea, useToast } from "@/components/ui";
import { ApiError, describeError, useApiMutation } from "@/lib/api";
import { MemberField } from "./member-field";
import type { FieldDef, FormValues, ResourceConfig } from "./types";

export type ResourceDialogState<T> = { mode: "create" } | { mode: "edit"; item: T };

interface FieldsProps {
  fields: readonly FieldDef[];
  form: UseFormReturn<FormValues>;
}

const INPUT_TYPES = {
  text: "text",
  email: "email",
  tel: "tel",
  integer: "text",
  money: "text",
  date: "date",
  datetime: "datetime-local",
} as const;

function FormFields({ fields, form }: FieldsProps) {
  const { register, formState } = form;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const error = formState.errors[field.name]?.message;
        const common = { label: field.label, required: field.required, hint: field.hint, error };
        return (
          <div key={field.name} className={field.half ? undefined : "sm:col-span-2"}>
            {field.kind === "textarea" ? (
              <Textarea {...common} rows={3} {...register(field.name)} />
            ) : field.kind === "select" ? (
              <Select {...common} options={field.options ?? []} {...register(field.name)} />
            ) : field.kind === "member" ? (
              <MemberField field={field} form={form} error={error} />
            ) : (
              <Input
                {...common}
                type={INPUT_TYPES[field.kind]}
                inputMode={field.kind === "integer" ? "numeric" : field.kind === "money" ? "decimal" : undefined}
                autoComplete="off"
                {...register(field.name)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface FormBodyProps<T extends { id: string }> {
  config: ResourceConfig<T>;
  state: ResourceDialogState<T>;
  onClose: () => void;
}

function FormBody<T extends { id: string }>({ config, state, onClose }: FormBodyProps<T>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const formId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const mode = state.mode === "create" ? "create" : "update";
  const { copy } = config;

  const form = useForm<FormValues>({
    resolver: zodResolver(config.schema),
    defaultValues: config.initialValues(state.mode === "edit" ? state.item : null),
  });

  const save = useApiMutation(
    (body: Record<string, unknown>, client) =>
      state.mode === "create" ? client.post<T>(config.path, body) : client.patch<T>(`${config.path}/${state.item.id}`, body),
    { onSuccess: () => queryClient.invalidateQueries({ queryKey: [config.key] }) },
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(config.toBody(values, mode));
      toast({ title: mode === "create" ? copy.createdToast : copy.updatedToast, description: config.nameOf(saved), tone: "success" });
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          const apiField = fieldError.path.split(".").pop() ?? "";
          const field = config.fieldAliases?.[apiField] ?? apiField;
          if (config.fields.some((candidate) => candidate.name === field)) form.setError(field, { message: "Valore non valido" });
        }
      }
      setFormError(describeError(error));
    }
  });

  return (
    <DialogContent
      className="max-w-lg"
      title={state.mode === "create" ? copy.createTitle : copy.editTitle}
      description={state.mode === "create" ? copy.createDescription : copy.editDescription}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost">Annulla</Button>
          </DialogClose>
          <Button type="submit" form={formId} leftIcon={<Save />} loading={form.formState.isSubmitting}>
            {state.mode === "create" ? copy.createSubmit : "Salva le modifiche"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <FormFields fields={config.fields} form={form} />
      </form>
    </DialogContent>
  );
}

export interface ResourceFormDialogProps<T extends { id: string }> {
  config: ResourceConfig<T>;
  state: ResourceDialogState<T> | null;
  onClose: () => void;
}

/** Create/edit dialog generated from the field list of the resource. */
export function ResourceFormDialog<T extends { id: string }>({ config, state, onClose }: ResourceFormDialogProps<T>) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <FormBody key={state.mode === "edit" ? state.item.id : "new"} config={config} state={state} onClose={onClose} />
    </Dialog>
  );
}
