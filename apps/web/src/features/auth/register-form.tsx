"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, BellRing, Link2, Rocket, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, describeError } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { StepHeading, Stepper, useFormSteps } from "./form-steps";
import { PasswordInput } from "./password-input";
import { registerSchema, type RegisterValues } from "./schemas";

const FIELD_NAMES: readonly string[] = ["societyName", "firstName", "lastName", "email", "password"];

const STEPS = ["La tua società", "Il tuo accesso"] as const;
const LAST_STEP = STEPS.length - 1;

const AFTER_REGISTRATION: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Users, title: "Crei le squadre", text: "Aggiungi le squadre della società dalla pagina Squadre." },
  { icon: Link2, title: "Inviti gli atleti con un link", text: "Atleti e genitori si iscrivono da soli e trovano subito la loro area personale." },
  { icon: BellRing, title: "L'app ricorda quote e scadenze", text: "Ti avvisa delle quote da incassare e dei certificati in scadenza." },
];

/** API paths look like "admin.email": keep the last segment when it is a field of this form. */
function formFieldOf(apiPath: string): Path<RegisterValues> | null {
  const field = apiPath.split(".").pop() ?? "";
  return FIELD_NAMES.includes(field) ? (field as Path<RegisterValues>) : null;
}

function stepOfField(field: Path<RegisterValues>): number {
  return field === "societyName" ? 0 : 1;
}

function AfterRegistration() {
  return (
    <section aria-labelledby="after-registration" className="mt-8 border-t border-line pt-6">
      <h2 id="after-registration" className="text-sm font-bold text-fg">
        Cosa succede dopo
      </h2>
      <ul aria-labelledby="after-registration" className="mt-4 flex flex-col gap-4">
        {AFTER_REGISTRATION.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-fg">
              <Icon className="size-4" />
            </span>
            <p className="min-w-0 text-sm text-fg-muted">
              <span className="block font-semibold text-fg">{title}</span>
              {text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RegisterForm() {
  const { register: registerSociety } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { societyName: "", firstName: "", lastName: "", email: "", password: "", confirmPassword: "" },
  });
  const { step, goTo, headingRef } = useFormSteps<Path<RegisterValues>>(setFocus);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerSociety({
        societyName: values.societyName,
        admin: {
          email: values.email.trim(),
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "email_taken") {
        setError("email", { message: describeError(error) });
        setFocus("email");
        return;
      }
      if (error instanceof ApiError) {
        let firstField: Path<RegisterValues> | null = null;
        for (const fieldError of error.fieldErrors) {
          const field = formFieldOf(fieldError.path);
          if (!field) continue;
          setError(field, { message: "Valore non valido" });
          if (firstField === null || stepOfField(field) < stepOfField(firstField)) firstField = field;
        }
        // An error on a field of the first step sends the user back to it
        if (firstField !== null) {
          if (stepOfField(firstField) < step) goTo(stepOfField(firstField), firstField);
          else setFocus(firstField);
        }
      }
      setFormError(describeError(error));
    }
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step < LAST_STEP) {
      event.preventDefault();
      void trigger("societyName").then((valid) => {
        if (valid) goTo(step + 1);
      });
      return;
    }
    void submit(event);
  };

  return (
    <div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Stepper steps={STEPS} current={step} />
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {step === 0 ? (
          <>
            <StepHeading
              headingRef={headingRef}
              title="La tua società"
              description="Il nome con cui atleti e genitori vedranno la società quando si iscrivono."
            />
            <Input
              label="Nome della società"
              autoComplete="organization"
              required
              error={errors.societyName?.message}
              {...register("societyName")}
            />
            <Button type="submit" size="lg" fullWidth rightIcon={<ArrowRight />}>
              Continua
            </Button>
          </>
        ) : (
          <>
            <StepHeading
              headingRef={headingRef}
              title="Il tuo accesso"
              description="Sarai l'amministratore della società. Con questi dati entri nell'app."
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Nome"
                autoComplete="given-name"
                required
                error={errors.firstName?.message}
                {...register("firstName")}
              />
              <Input
                label="Cognome"
                autoComplete="family-name"
                required
                error={errors.lastName?.message}
                {...register("lastName")}
              />
            </div>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              hint="Sarà l'accesso dell'amministratore della società."
              error={errors.email?.message}
              {...register("email")}
            />
            <PasswordInput
              label="Password"
              autoComplete="new-password"
              required
              hint="Almeno 8 caratteri."
              error={errors.password?.message}
              {...register("password")}
            />
            <PasswordInput
              label="Ripeti la password"
              autoComplete="new-password"
              required
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button variant="ghost" size="lg" leftIcon={<ArrowLeft />} onClick={() => goTo(step - 1)}>
                Indietro
              </Button>
              <Button type="submit" size="lg" loading={isSubmitting} leftIcon={<Rocket />}>
                Crea la società
              </Button>
            </div>
          </>
        )}
        <p className="text-center text-sm text-fg-muted">
          Hai già un account?{" "}
          <Link href="/login" className="font-semibold text-primary-fg underline-offset-4 hover:underline">
            Accedi
          </Link>
        </p>
      </form>
      <AfterRegistration />
    </div>
  );
}
