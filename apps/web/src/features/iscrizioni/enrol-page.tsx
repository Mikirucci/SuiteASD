"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CalendarCheck, FileCheck2, UserCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, EmptyState, ErrorState, Highlight, Input, Select, Skeleton } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { StepHeading, Stepper, useFormSteps } from "@/features/auth/form-steps";
import { PasswordInput } from "@/features/auth/password-input";
import { teamLabel } from "@/features/tesserati/document-format";
import { ApiError, describeError } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { enrol, useJoinInfo, type EnrolBody, type JoinInfo } from "./api";
import { KindChoiceGroup } from "./kind-choice";

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
      if (values.athleteFirstName === "") ctx.addIssue({ code: "custom", path: ["athleteFirstName"], message: "Inserisci il nome dell'atleta" });
      if (values.athleteLastName === "") ctx.addIssue({ code: "custom", path: ["athleteLastName"], message: "Inserisci il cognome dell'atleta" });
    }
  });

type EnrolValues = z.infer<typeof enrolSchema>;
type EnrolField = Path<EnrolValues>;

const STEPS = ["Chi si iscrive", "Il tuo accesso", "Dati dell'atleta"] as const;
const CHOICE_STEP = 0;
const ACCOUNT_STEP = 1;
const LAST_STEP = STEPS.length - 1;

/** Fields the person fills in the account step: they are checked before moving on to the athlete. */
const ACCOUNT_FIELDS: readonly EnrolField[] = ["firstName", "lastName", "email", "password", "phone", "relation"];

const GAINS: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: FileCheck2, title: "Documenti", text: "carichi il certificato medico e vedi cosa manca." },
  { icon: CalendarCheck, title: "Convocazioni", text: "vedi le partite e gli allenamenti a cui sei convocato." },
  { icon: Wallet, title: "Quote", text: "vedi cosa è stato pagato e cosa resta da pagare." },
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
  guardian_required: "Sotto i 14 anni deve iscriversi un genitore: scegli «Iscrivo mio figlio o mia figlia».",
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

/** Where the person goes back to fix what the server refused; null when the current step is the right one. */
function stepToFix(error: unknown): { step: number; field: EnrolField | null } | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "guardian_required") return { step: CHOICE_STEP, field: null };
  if (error.code === "member_already_exists") return { step: ACCOUNT_STEP, field: "email" };
  if (error.status === 401) return { step: ACCOUNT_STEP, field: "password" };
  return null;
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

const CHOICE_HEADING_ID = "enrol-choice-heading";

/** Who the link is for and what the person gets. Whole on the first step; a single line afterwards, so the form stays on the first screen. */
function EnrolIntro({ info, compact }: { info: JoinInfo; compact: boolean }) {
  const team = info.team;
  if (compact) {
    return (
      <h1 className="text-sm font-semibold text-fg-muted">
        Iscrizione a <span className="text-fg">{info.society.name}</span>
        {team ? (
          <>
            , squadra <span className="text-fg">{teamLabel(team)}</span>
          </>
        ) : null}
      </h1>
    );
  }
  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-extrabold leading-tight tracking-title text-fg sm:text-2xl">
          Ti stai iscrivendo a <Highlight>{info.society.name}</Highlight>
        </h1>
        {team ? (
          <p className="flex items-center gap-2 text-base font-semibold text-fg">
            <Users aria-hidden="true" className="size-5 shrink-0 text-primary-fg" />
            Entri nella squadra {teamLabel(team)}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="enrol-gains" className="border-y border-line py-4">
        <h2 id="enrol-gains" className="text-sm font-bold text-fg">
          Alla fine ottieni la tua area personale
        </h2>
        <ul aria-label="La tua area personale" className="mt-3 flex flex-col gap-3">
          {GAINS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3 text-sm text-fg-muted">
              <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-fg" />
              <span>
                <span className="font-semibold text-fg">{title}</span>: {text}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function EnrolForm({ code, info }: { code: string; info: JoinInfo }) {
  const router = useRouter();
  const { adoptSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    trigger,
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
  const { step, goTo, headingRef } = useFormSteps<EnrolField>(setFocus);
  const kind = useWatch({ control, name: "kind" });
  const guardian = kind === "GENITORE";

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const today = new Date();
    if (values.birthDate > toDayKey(today)) {
      setError("birthDate", { message: "La data di nascita non può essere nel futuro" });
      return;
    }
    if (!guardian && ageOn(values.birthDate, today) < MIN_SELF_ENROLMENT_AGE) {
      setError("birthDate", {
        message: "Sotto i 14 anni deve iscriverti un genitore: torna indietro e scegli «Iscrivo mio figlio o mia figlia»",
      });
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
      const fix = stepToFix(error);
      if (!fix) return;
      if (fix.field) setError(fix.field, { message: fix.field === "email" ? "Questa email è già iscritta" : "La password non coincide" });
      goTo(fix.step, fix.field);
    }
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step === LAST_STEP) {
      void submit(event);
      return;
    }
    event.preventDefault();
    if (step === CHOICE_STEP) {
      goTo(ACCOUNT_STEP);
      return;
    }
    void trigger([...ACCOUNT_FIELDS]).then((valid) => {
      if (valid) goTo(step + 1);
    });
  };

  const back = (
    <Button variant="ghost" size="lg" leftIcon={<ArrowLeft />} onClick={() => goTo(step - 1)}>
      Indietro
    </Button>
  );
  const forward = (
    <Button type="submit" size="lg" rightIcon={<ArrowRight />}>
      Continua
    </Button>
  );

  return (
    <>
      <EnrolIntro info={info} compact={step !== CHOICE_STEP} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Stepper steps={STEPS} current={step} />
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        {step === CHOICE_STEP ? (
          <>
            <StepHeading id={CHOICE_HEADING_ID} headingRef={headingRef} title="Chi si iscrive?" />
            <KindChoiceGroup labelledBy={CHOICE_HEADING_ID} registration={register("kind")} />
            <p className="text-sm text-fg-muted">Sotto i 14 anni l&apos;iscrizione la fa un genitore o un tutore.</p>
            <Button type="submit" size="lg" fullWidth rightIcon={<ArrowRight />}>
              Continua
            </Button>
          </>
        ) : null}

        {step === ACCOUNT_STEP ? (
          <>
            <StepHeading
              headingRef={headingRef}
              title="Il tuo accesso"
              description={
                guardian
                  ? "Sei il genitore o il tutore. Con questi dati entri nell'area personale e segui tuo figlio o tua figlia."
                  : "Con questi dati entri nella tua area personale."
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nome" required autoComplete="given-name" error={errors.firstName?.message} {...register("firstName")} />
              <Input label="Cognome" required autoComplete="family-name" error={errors.lastName?.message} {...register("lastName")} />
            </div>
            {guardian ? <Select label="Tu sei" options={RELATIONS} error={errors.relation?.message} {...register("relation")} /> : null}
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
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              {back}
              {forward}
            </div>
          </>
        ) : null}

        {step === LAST_STEP ? (
          <>
            <StepHeading
              headingRef={headingRef}
              title="Dati dell'atleta"
              description={guardian ? "I dati di tuo figlio o tua figlia." : "I tuoi dati sportivi."}
            />
            {guardian ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Nome dell'atleta" required autoComplete="off" error={errors.athleteFirstName?.message} {...register("athleteFirstName")} />
                <Input label="Cognome dell'atleta" required autoComplete="off" error={errors.athleteLastName?.message} {...register("athleteLastName")} />
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Data di nascita" type="date" required max={toDayKey(new Date())} error={errors.birthDate?.message} {...register("birthDate")} />
              <Select label="Genere" placeholder="Non indicato" options={GENDERS} error={errors.gender?.message} {...register("gender")} />
            </div>
            <Input label="Ruolo in campo" hint="Facoltativo, ad esempio Libero." error={errors.fieldRole?.message} {...register("fieldRole")} />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              {back}
              <Button type="submit" size="lg" loading={isSubmitting}>
                Completa l&apos;iscrizione
              </Button>
            </div>
          </>
        ) : null}
      </form>
    </>
  );
}

/** Public page of an enrolment link: who it is for, what the person gets, and the steps that create the account and the member in one go. */
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

  return (
    <div className="flex flex-col gap-6">
      <EnrolForm code={code} info={info.data} />
      <p className="text-center text-sm text-fg-muted">
        Hai già un account?{" "}
        <Link href="/login" className="font-semibold text-primary-fg underline underline-offset-2">
          Accedi
        </Link>
      </p>
    </div>
  );
}
