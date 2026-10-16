"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, describeError } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { useAddChild } from "./api";

const FORM_ID = "add-child-form";

const name = (label: string) => z.string().trim().min(1, `Inserisci ${label}`).max(80, "Massimo 80 caratteri");

const childSchema = z.object({
  firstName: name("il nome"),
  lastName: name("il cognome"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Inserisci la data di nascita"),
  gender: z.enum(["", "FEMALE", "MALE"]),
  relation: z.enum(["PADRE", "MADRE", "TUTORE", "ALTRO"]),
});

type ChildValues = z.infer<typeof childSchema>;

const RELATIONS = [
  { value: "MADRE", label: "Madre" },
  { value: "PADRE", label: "Padre" },
  { value: "TUTORE", label: "Tutore" },
  { value: "ALTRO", label: "Altro familiare" },
] as const;

const GENDERS = [
  { value: "FEMALE", label: "Femmina" },
  { value: "MALE", label: "Maschio" },
] as const;

function ChildForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { refresh } = useAuth();
  const add = useAddChild();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ChildValues>({
    resolver: zodResolver(childSchema),
    defaultValues: { firstName: "", lastName: "", birthDate: "", gender: "", relation: "ALTRO" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (values.birthDate > toDayKey(new Date())) {
      setError("birthDate", { message: "La data di nascita non può essere nel futuro" });
      return;
    }
    try {
      const child = await add.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        birthDate: values.birthDate,
        relation: values.relation,
        ...(values.gender === "" ? {} : { gender: values.gender }),
      });
      // The child shows up in the pickers of every page once the user is reloaded
      await refresh();
      toast({ title: "Figlio aggiunto", description: `${child.firstName} ${child.lastName}: la segreteria lo assegnerà a una squadra.`, tone: "success" });
      onClose();
    } catch (error) {
      setFormError(error instanceof ApiError && error.code === "fiscal_code_taken" ? "Questo atleta è già registrato." : describeError(error));
    }
  });

  return (
    <DialogContent
      className="max-w-md"
      title="Aggiungi un figlio"
      description="Lo registri tu: la segreteria lo assegna alla squadra giusta."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost">Annulla</Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} leftIcon={<UserPlus />} loading={add.isPending}>
            Aggiungi
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome" required autoComplete="off" error={errors.firstName?.message} {...register("firstName")} />
          <Input label="Cognome" required autoComplete="off" error={errors.lastName?.message} {...register("lastName")} />
        </div>
        <Input label="Data di nascita" type="date" required max={toDayKey(new Date())} error={errors.birthDate?.message} {...register("birthDate")} />
        <Select label="Genere" placeholder="Non indicato" options={GENDERS} error={errors.gender?.message} {...register("gender")} />
        <Select label="Tu sei" options={RELATIONS} error={errors.relation?.message} {...register("relation")} />
      </form>
    </DialogContent>
  );
}

export interface AddChildDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A guardian registers one more child. */
export function AddChildDialog({ open, onOpenChange }: AddChildDialogProps) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <ChildForm onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
