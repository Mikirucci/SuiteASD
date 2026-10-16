"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { PasswordInput } from "@/features/auth/password-input";
import { ApiError, describeError, useApiMutation, type SessionResponse } from "@/lib/api";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Inserisci la password attuale").max(128),
    newPassword: z.string().min(8, "La nuova password deve avere almeno 8 caratteri").max(128, "Massimo 128 caratteri"),
    confirmPassword: z.string().min(1, "Ripeti la nuova password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Le password non coincidono",
  });

type PasswordValues = z.infer<typeof passwordSchema>;

/** Changes the password; every other device is signed out and this one stays signed in with a fresh session. */
export function PasswordForm() {
  const { toast } = useToast();
  const { adoptSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const change = useApiMutation((body: { currentPassword: string; newPassword: string }, client) =>
    client.put<SessionResponse>("/auth/password", body),
  );
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await change.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      await adoptSession(session);
      reset();
      toast({ title: "Password cambiata", description: "Gli altri dispositivi dovranno accedere di nuovo.", tone: "success" });
    } catch (error) {
      if (error instanceof ApiError && error.code === "invalid_current_password") {
        setError("currentPassword", { message: "La password attuale non è corretta" });
        return;
      }
      setFormError(describeError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4" aria-label="Cambio password">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <PasswordInput label="Password attuale" autoComplete="current-password" error={errors.currentPassword?.message} {...register("currentPassword")} />
      <PasswordInput label="Nuova password" autoComplete="new-password" hint="Almeno 8 caratteri." error={errors.newPassword?.message} {...register("newPassword")} />
      <PasswordInput label="Ripeti la nuova password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register("confirmPassword")} />
      <div>
        <Button type="submit" variant="secondary" leftIcon={<KeyRound />} loading={change.isPending}>
          Cambia la password
        </Button>
      </div>
    </form>
  );
}
