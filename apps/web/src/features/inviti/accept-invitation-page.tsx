"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, EmptyState, ErrorState, Input, SectionHeading, Skeleton } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { hasAdministration } from "@/features/auth/areas";
import { PasswordInput } from "@/features/auth/password-input";
import { ROLE_LABELS } from "@/features/shell/role-labels";
import { ApiError, describeError } from "@/lib/api";
import { acceptInvitation, useInvitationInfo, type InvitationInfo } from "./api";

const name = z.string().trim().max(80, "Massimo 80 caratteri");

const acceptSchema = z.object({
  firstName: name,
  lastName: name,
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(128, "Massimo 128 caratteri"),
});

type AcceptValues = z.infer<typeof acceptSchema>;

const PROFILE_MESSAGE = "Scrivilo: serve per creare il tuo accesso.";

const UNUSABLE_MESSAGES: Record<string, string> = {
  invitation_expired: "Questo invito è scaduto. Chiedi a chi ti ha invitato di mandartene uno nuovo.",
  invitation_revoked: "Questo invito è stato annullato. Chiedi a chi ti ha invitato di mandartene uno nuovo.",
  invitation_used: "Questo invito è già stato usato. Se hai già creato il tuo accesso, entra dalla pagina di accesso.",
};

const DEFAULT_UNUSABLE_MESSAGE = "È scaduto, è stato revocato oppure è già stato usato. Chiedi a chi ti ha invitato di mandartene uno nuovo.";
const NOT_FOUND_MESSAGE = "Questo invito non esiste. Controlla di aver copiato il link per intero o chiedi di mandartelo di nuovo.";

function Unusable({ message = DEFAULT_UNUSABLE_MESSAGE }: { message?: string }) {
  return (
    <EmptyState
      icon={MailX}
      title="Invito non utilizzabile"
      description={message}
      action={
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
        >
          Vai all&apos;accesso
        </Link>
      }
    />
  );
}

function AcceptForm({ token, info }: { token: string; info: InvitationInfo }) {
  const router = useRouter();
  const { adoptSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [unusable, setUnusable] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AcceptValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { firstName: "", lastName: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await acceptInvitation({
        token,
        password: values.password,
        ...(values.firstName ? { firstName: values.firstName } : {}),
        ...(values.lastName ? { lastName: values.lastName } : {}),
      });
      await adoptSession(session);
      router.replace(hasAdministration(session.roles) ? "/" : "/area-personale");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "invalid_invitation") {
          setUnusable(true);
          return;
        }
        if (error.code === "profile_required") {
          setError("firstName", { message: PROFILE_MESSAGE });
          setError("lastName", { message: PROFILE_MESSAGE });
          setFormError("Per creare il tuo accesso servono nome e cognome.");
          return;
        }
        if (error.status === 401) {
          setFormError("Questa email ha già un account e la password non coincide: scrivi la password del tuo account.");
          return;
        }
      }
      setFormError(describeError(error));
    }
  });

  if (unusable) return <Unusable />;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Invito"
        title={`Sei stato invitato da ${info.society.name} come ${ROLE_LABELS[info.role].toLowerCase()}.`}
        highlight={info.society.name}
        description={`L'invito è per ${info.maskedEmail}. Scegli una password per entrare. Se hai già un account, scrivi la password che usi di solito.`}
      />
      <form onSubmit={onSubmit} noValidate aria-label="Accetta l'invito" className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-xs font-bold uppercase tracking-label text-fg-muted">Chi sei</legend>
          <p className="-mt-1 text-sm text-fg-muted">Solo se non hai ancora un account.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nome" autoComplete="given-name" error={errors.firstName?.message} {...register("firstName")} />
            <Input label="Cognome" autoComplete="family-name" error={errors.lastName?.message} {...register("lastName")} />
          </div>
        </fieldset>
        <PasswordInput
          label="Password"
          required
          autoComplete="new-password"
          hint="Almeno 8 caratteri."
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" size="lg" loading={isSubmitting} fullWidth>
          Entra nella società
        </Button>
      </form>
    </div>
  );
}

/** Public page of an invitation link: says who invites and as what, then sets the password (and the name, for a new account) and signs the person in. */
export function AcceptInvitationPage({ token }: { token: string }) {
  const info = useInvitationInfo(token);

  if (info.isLoading) {
    return (
      <div role="status" aria-label="Caricamento dell'invito" className="flex flex-col gap-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  if (info.error) {
    const { status, code } = info.error;
    if (status === 410) return <Unusable message={(code && UNUSABLE_MESSAGES[code]) || DEFAULT_UNUSABLE_MESSAGE} />;
    if (status === 404) return <Unusable message={NOT_FOUND_MESSAGE} />;
    return <ErrorState message={describeError(info.error)} onRetry={() => void info.refetch()} />;
  }
  if (!info.data) return null;
  return <AcceptForm token={token} info={info.data} />;
}
