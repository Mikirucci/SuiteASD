"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Input } from "@/components/ui";
import { describeError } from "@/lib/api";
import { AuthHeading } from "./auth-frame";
import { requestPasswordReset } from "./recovery-api";

const forgotSchema = z.object({
  email: z.email("Inserisci un'email valida").max(254, "L'email è troppo lunga"),
});

type ForgotValues = z.infer<typeof forgotSchema>;

/**
 * The first step to get back in: the email of the account. The answer is the same whether the address is registered or
 * not, so nobody can find out who has an account here.
 */
export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const email = values.email.trim();
      await requestPasswordReset(email);
      setSentTo(email);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  if (sentTo) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title="Controlla la posta" description="Ti abbiamo scritto, se l'indirizzo è registrato." />
        <Alert tone="success" title="Richiesta inviata">
          Se <strong className="break-all">{sentTo}</strong> è registrato, tra pochi minuti trovi un&apos;email con il link per scegliere una nuova
          password. Il link vale 30 minuti e si usa una volta sola. Controlla anche la cartella dello spam.
        </Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" leftIcon={<MailCheck />} onClick={() => setSentTo(null)}>
            Usa un altro indirizzo
          </Button>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
          >
            Torna all&apos;accesso
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <AuthHeading title="Password dimenticata" description="Scrivi l'email con cui accedi: ti mandiamo un link per sceglierne una nuova." />
      <form onSubmit={onSubmit} noValidate aria-label="Richiedi il link per la nuova password" className="flex flex-col gap-5">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Input label="Email" type="email" autoComplete="email" inputMode="email" required error={errors.email?.message} {...register("email")} />
        <Button type="submit" size="lg" fullWidth loading={isSubmitting} leftIcon={<Send />}>
          Mandami il link
        </Button>
        <p className="text-center text-sm text-fg-muted">
          Ti sei ricordato?{" "}
          <Link href="/login" className="font-semibold text-primary-fg underline-offset-4 hover:underline">
            Accedi
          </Link>
        </p>
      </form>
    </>
  );
}
