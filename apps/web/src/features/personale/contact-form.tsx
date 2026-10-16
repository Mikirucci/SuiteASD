"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Input, useToast } from "@/components/ui";
import type { MemberDetail } from "@/features/tesserati/types";
import { describeError } from "@/lib/api";
import { useUpdateOwnContact, type ContactBody } from "./api";

const optional = (max: number) => z.string().trim().max(max, `Massimo ${max} caratteri`);

const contactSchema = z.object({
  phone: optional(30).refine((value) => value === "" || value.length >= 3, "Il numero è troppo corto"),
  email: optional(254).refine((value) => value === "" || z.email().safeParse(value).success, "Inserisci un'email valida"),
  address: optional(160),
  city: optional(80),
  postalCode: optional(10),
  kitSize: optional(10),
});

type ContactValues = z.infer<typeof contactSchema>;

function valuesOf(member: MemberDetail): ContactValues {
  return {
    phone: member.phone ?? "",
    email: member.email ?? "",
    address: member.address ?? "",
    city: member.city ?? "",
    postalCode: member.postalCode ?? "",
    kitSize: member.kitSize ?? "",
  };
}

const orNull = (value: string): string | null => (value === "" ? null : value);

function bodyOf(values: ContactValues): ContactBody {
  return {
    phone: orNull(values.phone),
    email: orNull(values.email),
    address: orNull(values.address),
    city: orNull(values.city),
    postalCode: orNull(values.postalCode),
    kitSize: orNull(values.kitSize),
  };
}

/** Contact details of one person, editable by who looks after them. Name, birth date and teams stay with the society. */
export function ContactForm({ member }: { member: MemberDetail }) {
  const { toast } = useToast();
  const update = useUpdateOwnContact(member.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues: valuesOf(member) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await update.mutateAsync(bodyOf(values));
      reset(valuesOf(saved));
      toast({ title: "Dati salvati", description: `${saved.firstName} ${saved.lastName}`, tone: "success" });
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-label={`Contatti di ${member.firstName} ${member.lastName}`}>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Telefono" type="tel" autoComplete="tel" error={errors.phone?.message} {...register("phone")} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
        <Input label="Indirizzo" autoComplete="street-address" error={errors.address?.message} className="sm:col-span-2" {...register("address")} />
        <Input label="Città" autoComplete="address-level2" error={errors.city?.message} {...register("city")} />
        <Input label="CAP" autoComplete="postal-code" inputMode="numeric" error={errors.postalCode?.message} {...register("postalCode")} />
        <Input label="Taglia divisa" hint="Ad esempio S, M o L." error={errors.kitSize?.message} {...register("kitSize")} />
      </div>
      <div>
        <Button type="submit" leftIcon={<Save />} loading={update.isPending} disabled={!isDirty}>
          Salva i dati
        </Button>
      </div>
    </form>
  );
}
