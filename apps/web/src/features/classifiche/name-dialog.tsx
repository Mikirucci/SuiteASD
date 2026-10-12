"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation, type ApiClient } from "@/lib/api";
import { applyFieldErrors } from "@/lib/field-errors";
import { nameFormSchema, type NameFormValues } from "./schemas";

const FORM_ID = "name-form";

export interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialName?: string;
  submitLabel: string;
  successMessage: string;
  /** Sends the name to the API (POST or PATCH, decided by the caller). */
  save: (name: string, client: ApiClient) => Promise<unknown>;
}

/** One-field dialog used for groups and for the teams of a group (create, add an opponent, rename). */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialName = "",
  submitLabel,
  successMessage,
  save,
}: NameDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<NameFormValues>({ resolver: zodResolver(nameFormSchema), defaultValues: { name: initialName } });

  const mutation = useApiMutation((name: string, client) => save(name, client), {
    onSuccess: async () => {
      await Promise.all(
        ["groups", "group-teams", "standings", "matches"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      toast({ title: successMessage, tone: "success" });
      onOpenChange(false);
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutation.mutateAsync(values.name);
    } catch (error) {
      if (applyFieldErrors(error, setError, (path) => (path === "name" ? "name" : null), "Nome non valido")) return;
      setFormError(describeError(error));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={mutation.isPending}>
              {submitLabel}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Input label={label} required autoComplete="off" error={errors.name?.message} {...register("name")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
