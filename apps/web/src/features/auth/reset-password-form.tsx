"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, EmptyState } from "@/components/ui";
import { ApiError, describeError } from "@/lib/api";
import { AuthHeading } from "./auth-frame";
import { useAuth } from "./auth-provider";
import { PasswordInput } from "./password-input";
import { resetPassword } from "./recovery-api";
import { PASSWORD_UPDATED_PARAM, PASSWORD_UPDATED_VALUE } from "./login-errors";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const resetSchema = z
  .object({
    newPassword: z
      .string()
      .min(PASSWORD_MIN, `La password deve avere almeno ${PASSWORD_MIN} caratteri`)
      .max(PASSWORD_MAX, `Massimo ${PASSWORD_MAX} caratteri`),
    confirmPassword: z.string().min(1, "Ripeti la password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Le password non coincidono",
  });

type ResetValues = z.infer<typeof resetSchema>;

function InvalidLink() {
  return (
    <EmptyState
      icon={LinkIcon}
      title="Link non valido o scaduto"
      description="Il link per cambiare la password vale 30 minuti e si usa una sola volta. Chiedine uno nuovo: ti arriva subito per email."
      action={
        <Link
          href="/password/dimenticata"
          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
        >
          Richiedi un nuovo link
        </Link>
      }
    />
  );
}

/**
 * The second step: the page the emailed link opens. On success the API has closed every session of the person, so
 * whatever was stored here is dropped and the person goes to the sign-in page.
 */
export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const { status, logout } = useAuth();
  const [invalid, setInvalid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { newPassword: "", confirmPassword: "" } });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setFormError(null);
    try {
      await resetPassword({ token, newPassword: values.newPassword });
    } catch (error) {
      if (error instanceof ApiError && error.code === "invalid_reset_token") {
        setInvalid(true);
        return;
      }
      setFormError(describeError(error));
      return;
    }
    if (status === "authenticated") await logout();
    router.replace(`/login?${PASSWORD_UPDATED_PARAM}=${PASSWORD_UPDATED_VALUE}`);
  });

  if (!token || invalid) return <InvalidLink />;

  return (
    <>
      <AuthHeading title="Scegli una nuova password" description="Da questo momento userai questa per accedere, su tutti i dispositivi." />
      <form onSubmit={onSubmit} noValidate aria-label="Scegli la nuova password" className="flex flex-col gap-5">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <PasswordInput
          label="Nuova password"
          autoComplete="new-password"
          required
          hint={`Da ${PASSWORD_MIN} a ${PASSWORD_MAX} caratteri.`}
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <PasswordInput label="Ripeti la password" autoComplete="new-password" required error={errors.confirmPassword?.message} {...register("confirmPassword")} />
        <Button type="submit" size="lg" fullWidth loading={isSubmitting} leftIcon={<KeyRound />}>
          Salva la nuova password
        </Button>
      </form>
    </>
  );
}
