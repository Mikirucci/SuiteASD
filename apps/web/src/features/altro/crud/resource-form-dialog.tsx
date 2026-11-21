"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { AttachmentsPanel } from "@/features/attachments/attachments-panel";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, Textarea, useToast } from "@/components/ui";
import { ApiError, describeError, useApiMutation } from "@/lib/api";
import type { Attachment, AttachmentEntityType } from "@/features/attachments/api";
import { MemberField } from "./member-field";
import { NewRecordFiles } from "./new-record-files";
import { SlotsField } from "./slots-field";
import { SuggestField } from "./suggest-field";
import type { FieldDef, FormValues, ResourceConfig } from "./types";

/** `presets` fill fields of a new record in advance (the item name when adding a piece to its group). */
export type ResourceDialogState<T> = { mode: "create"; presets?: FormValues } | { mode: "edit"; item: T; /** Shows the record without letting it change: the person can read it but not write it. */ readOnly?: boolean };

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
            ) : field.kind === "suggest" ? (
              <SuggestField field={field} form={form} error={error} />
            ) : field.kind === "slots" ? (
              <SlotsField field={field} form={form} error={error} />
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
  onDelete?: (item: T) => void;
}

function FormBody<T extends { id: string }>({ config, state, onClose, onDelete }: FormBodyProps<T>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const formId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  // Files can be chosen while creating: an existing record has its own "Allegati" action
  const attachmentType = state.mode === "create" ? config.attachmentType : undefined;
  const mode = state.mode === "create" ? "create" : "update";
  const { copy } = config;
  // A record that opens on click is its own page: fields, attachments and the way to delete it, all in one place
  const readOnly = state.mode === "edit" && state.readOnly === true;
  const detail = state.mode === "edit" && config.openOnClick && config.attachmentType ? { item: state.item, entityType: config.attachmentType } : null;

  const form = useForm<FormValues>({
    resolver: zodResolver(config.schema),
    defaultValues: state.mode === "edit" ? config.initialValues(state.item) : { ...config.initialValues(null), ...state.presets },
  });

  const save = useApiMutation(
    (body: Record<string, unknown>, client) =>
      state.mode === "create" ? client.post<T>(config.path, body) : client.patch<T>(`${config.path}/${state.item.id}`, body),
    { onSuccess: () => queryClient.invalidateQueries({ queryKey: [config.key] }) },
  );

  const upload = useApiMutation(({ entityType, entityId, file }: { entityType: AttachmentEntityType; entityId: string; file: File }, client) =>
    client.post<Attachment>("/attachments", file, { query: { entityType, entityId, fileName: file.name } }),
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(config.toBody(values, mode));
      const title = mode === "create" ? copy.createdToast : copy.updatedToast;
      const description = config.nameOf(saved);
      // The record exists from here on: a file that fails is reported, never a reason to save the record twice
      const failed: string[] = [];
      if (attachmentType) {
        for (const file of files) {
          try {
            await upload.mutateAsync({ entityType: attachmentType, entityId: saved.id, file });
          } catch {
            failed.push(file.name);
          }
        }
        if (files.length > 0) void queryClient.invalidateQueries({ queryKey: ["attachments", attachmentType, saved.id] });
      }
      if (failed.length === 0) toast({ title, description, tone: "success" });
      else toast({ title, description: `${description}. Non sono stati allegati: ${failed.join(", ")}. Riprova da "Allegati".`, tone: "danger" });
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
      className={detail ? "max-w-2xl" : "max-w-lg"}
      scrollable={readOnly}
      title={detail ? config.nameOf(detail.item) : state.mode === "create" ? copy.createTitle : copy.editTitle}
      description={readOnly ? "Puoi consultare questa scheda, ma non modificarla." : state.mode === "create" ? copy.createDescription : copy.editDescription}
      footer={
        <>
          {detail && onDelete && !readOnly ? (
            <Button variant="ghost" leftIcon={<Trash2 />} onClick={() => onDelete(detail.item)} className="text-danger hover:bg-danger-soft sm:mr-auto">
              Elimina
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button variant="secondary">{detail || readOnly ? "Chiudi" : "Annulla"}</Button>
          </DialogClose>
          {readOnly ? null : (
            <Button type="submit" form={formId} leftIcon={<Save />} loading={form.formState.isSubmitting}>
              {state.mode === "create" ? copy.createSubmit : "Salva le modifiche"}
            </Button>
          )}
        </>
      }
    >
      {state.mode === "edit" ? config.detailNote?.(state.item) : null}
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {/* A disabled fieldset turns off every field in it at once */}
        <fieldset disabled={readOnly} className="min-w-0 border-0 p-0">
          <FormFields fields={config.fields} form={form} />
        </fieldset>
        {attachmentType ? <NewRecordFiles files={files} onChange={setFiles} /> : null}
      </form>
      {detail && !readOnly ? (
        <section aria-labelledby={`${formId}-attachments`} className="mt-6 flex flex-col gap-3 border-t border-line pt-6">
          <h3 id={`${formId}-attachments`} className="text-base font-bold tracking-title text-fg">
            Allegati
          </h3>
          <AttachmentsPanel entityType={detail.entityType} entityId={detail.item.id} recordName={config.nameOf(detail.item)} />
        </section>
      ) : null}
    </DialogContent>
  );
}

export interface ResourceFormDialogProps<T extends { id: string }> {
  config: ResourceConfig<T>;
  state: ResourceDialogState<T> | null;
  onClose: () => void;
  /** Asked to delete the open record, from the detail of a resource that opens on click. */
  onDelete?: (item: T) => void;
}

/** Create/edit dialog generated from the field list of the resource; for a resource that opens on click it also holds the attachments. */
export function ResourceFormDialog<T extends { id: string }>({ config, state, onClose, onDelete }: ResourceFormDialogProps<T>) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <FormBody key={state.mode === "edit" ? state.item.id : "new"} config={config} state={state} onClose={onClose} onDelete={onDelete} />
    </Dialog>
  );
}
