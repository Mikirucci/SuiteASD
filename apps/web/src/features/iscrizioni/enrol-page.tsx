"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, EmptyState, ErrorState, Input, PillFilter, Select, SectionHeading, Skeleton } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { PasswordInput } from "@/features/auth/password-input";
import { teamLabel } from "@/features/tesserati/document-format";
import { ApiError, describeError } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { enrol, useJoinInfo, type EnrolBody } from "./api";

const MIN_SELF_ENROLMENT_AGE = 14;

const name = (label: string) => z.string().trim().min(1, `Inserisci ${label}`).max(80, "Massimo 80 caratteri");

const enrolSchema = z
  .object({
    kind: z.enum(["ATLETA", "GENITORE"]),
    firstName: name("il tuo nome"),
    lastName: name("il tuo cognome"),
    email: z.email("Inserisci un'email valida").max(254, "L'email è troppo lunga"),
    phone: z.string().trim().max(30, "Massimo 30 caratteri"),
    password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(128, "Massimo 128 caratteri"),
    relation: z.enum(["PADRE", "MADRE", "TUTORE", "ALTRO"]),
    athleteFirstName: z.string().trim().max(80, "Massimo 80 caratteri"),
    athleteLastName: z.string().trim().max(80, "Massimo 80 caratteri"),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Inserisci la data di nascita"),
    gender: z.enum(["", "FEMALE", "MALE"]),
    fieldRole: z.string().trim().max(40, "Massimo 40 caratteri"),
  })
  .superRefine((values, ctx) => {
    if (values.kind === "GENITORE") {
      if (values.athleteFirstName === "") ctx.addIssue({ code: "custom", path: ["athleteFirstName"], message: "Inserisci il nome di tuo figlio" });
      if (values.athleteLastName === "") ctx.addIssue({ code: "custom", path: ["athleteLastName"], message: "Inserisci il cognome di tuo figlio" });
    }
  });

type EnrolValues = z.infer<typeof enrolSchema>;

const KIND_OPTIONS = [
  { value: "ATLETA", label: "Mi iscrivo io" },
  { value: "GENITORE", label: "Iscrivo mio figlio" },
];

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

/** Whole years between a birth day ("YYYY-MM-DD") and today. */
export function ageOn(birthDate: string, today: Date): number {
  const [year = 0, month = 1, day = 1] = birthDate.split("-").map(Number);
  const age = today.getFullYear() - year;
  const birthdayPassed = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  return birthdayPassed ? age : age - 1;
}

const GONE_MESSAGES: Record<string, string> = {
  join_link_revoked: "Questo link non è più valido: la società lo ha disattivato.",
  join_link_expired: "Questo link è scaduto.",
  join_link_exhausted: "Questo link ha raggiunto il numero di iscrizioni consentite.",
};

const SERVER_MESSAGES: Record<string, string> = {
  member_already_exists: "Sei già iscritto a questa società: accedi con la tua email.",
  fiscal_code_taken: "Questo atleta è già registrato. Chiedi alla segreteria di mandarti un invito.",
  guardian_required: "Sotto i 14 anni deve iscriversi un genitore: scegli «Iscrivo mio figlio».",
  invalid_birth_date: "La data di nascita non può essere nel futuro.",
};

function describeEnrolError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && error.code in GONE_MESSAGES) return GONE_MESSAGES[error.code] ?? describeError(error);
    if (error.code && error.code in SERVER_MESSAGES) return SERVER_MESSAGES[error.code] ?? describeError(error);
    if (error.status === 401) return "Questa email ha già un account e la password non coincide: usa quella del tuo account.";
  }
  return describeError(error);
}

function Closed({ message }: { message: string }) {
  return (
    <EmptyState
      icon={UserCheck}
      title="Link non utilizzabile"
      description={message}
      action={
        <Link href="/login" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary-fg hover:bg-primary-soft">
          Vai all&apos;accesso
        </Link>
      }
    />
  );
}

function EnrolForm({ code }: { code: string }) {
  const router = useRouter();
  const { adoptSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EnrolValues>({
    resolver: zodResolver(enrolSchema),
    defaultValues: {
      kind: "ATLETA",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      relation: "MADRE",
      athleteFirstName: "",
      athleteLastName: "",
      birthDate: "",
      gender: "",
      fieldRole: "",
    },
  });
  const kind = useWatch({ control, name: "kind" });
  const guardian = kind === "GENITORE";

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const today = new Date();
    if (values.birthDate > toDayKey(today)) {
      setError("birthDate", { message: "La data di nascita non può essere nel futuro" });
      return;
    }
    if (!guardian && ageOn(values.birthDate, today) < MIN_SELF_ENROLMENT_AGE) {
      setError("birthDate", { message: "Sotto i 14 anni deve iscriverti un genitore: scegli «Iscrivo mio figlio»" });
      return;
    }
    const body: EnrolBody = {
      kind: values.kind,
      relation: values.relation,
      account: {
        email: values.email.trim(),
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        ...(values.phone ? { phone: values.phone } : {}),
      },
      athlete: {
        birthDate: values.birthDate,
        ...(guardian ? { firstName: values.athleteFirstName, lastName: values.athleteLastName } : {}),
        ...(values.gender === "" ? {} : { gender: values.gender }),
        ...(values.fieldRole ? { fieldRole: values.fieldRole } : {}),
      },
    };
    try {
      const session = await enrol(code, body);
      await adoptSession(session);
      router.replace("/area-personale");
    } catch (error) {
      setFormError(describeEnrolError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <PillFilter
        label="Chi si iscrive"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(value) => setValue("kind", value === "GENITORE" ? "GENITORE" : "ATLETA")}
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-xs font-bold uppercase tracking-label text-fg-muted">{guardian ? "I tuoi dati" : "I tuoi dati di accesso"}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome" required autoComplete="given-name" error={errors.firstName?.message} {...register("firstName")} />
          <Input label="Cognome" required autoComplete="family-name" error={errors.lastName?.message} {...register("lastName")} />
        </div>
        <Input label="Email" type="email" required autoComplete="email" error={errors.email?.message} {...register("email")} />
        <PasswordInput
          label="Password"
          required
          autoComplete="new-password"
          hint="Almeno 8 caratteri. Se hai già un account, scrivi la tua password di sempre."
          error={errors.password?.message}
          {...register("password")}
        />
        <Input label="Telefono" type="tel" autoComplete="tel" hint="Facoltativo." error={errors.phone?.message} {...register("phone")} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-xs font-bold uppercase tracking-label text-fg-muted">{guardian ? "Dati di tuo figlio" : "Dati sportivi"}</legend>
        {guardian ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nome del figlio" required autoComplete="off" error={errors.athleteFirstName?.message} {...register("athleteFirstName")} />
              <Input label="Cognome del figlio" required autoComplete="off" error={errors.athleteLastName?.message} {...register("athleteLastName")} />
            </div>
            <Select label="Tu sei" options={RELATIONS} error={errors.relation?.message} {...register("relation")} />
          </>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Data di nascita" type="date" required max={toDayKey(new Date())} error={errors.birthDate?.message} {...register("birthDate")} />
          <Select label="Genere" placeholder="Non indicato" options={GENDERS} error={errors.gender?.message} {...register("gender")} />
        </div>
        <Input label="Ruolo in campo" hint="Facoltativo, ad esempio Libero." error={errors.fieldRole?.message} {...register("fieldRole")} />
      </fieldset>

      <Button type="submit" size="lg" loading={isSubmitting} fullWidth>
        Completa l&apos;iscrizione
      </Button>
    </form>
  );
}

/** Public page of an enrolment link: who it is for, and the form that creates the account and the member in one go. */
export function EnrolPage({ code }: { code: string }) {
  const info = useJoinInfo(code);

  if (info.isLoading) {
    return (
      <div role="status" aria-label="Caricamento del link" className="flex flex-col gap-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  if (info.error) {
    const error = info.error;
    if (error.status === 410) return <Closed message={(error.code && GONE_MESSAGES[error.code]) || "Questo link non è più valido."} />;
    if (error.status === 404) return <Closed message="Questo link non esiste. Controlla di averlo copiato per intero o chiedi alla società di mandartelo di nuovo." />;
    return <ErrorState message={describeError(error)} onRetry={() => void info.refetch()} />;
  }
  if (!info.data) return null;

  const team = info.data.team;
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label={info.data.society.name}
        title="Iscriviti in due minuti."
        highlight="due minuti."
        description={team ? `Entri nella squadra ${teamLabel(team)}. Poi carichi i documenti dalla tua area personale.` : "Poi carichi i documenti dalla tua area personale."}
      />
      <EnrolForm code={code} />
      <p className="text-center text-sm text-fg-muted">
        Hai già un account?{" "}
        <Link href="/login" className="font-semibold text-primary-fg underline underline-offset-2">
          Accedi
        </Link>
      </p>
    </div>
  );
}
