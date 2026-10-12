"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Rocket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, describeError } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { PasswordInput } from "./password-input";
import { registerSchema, type RegisterValues } from "./schemas";

const FIELD_NAMES: readonly string[] = ["societyName", "firstName", "lastName", "email", "password"];

/** API paths look like "admin.email": keep the last segment when it is a field of this form. */
function formFieldOf(apiPath: string): Path<RegisterValues> | null {
  const field = apiPath.split(".").pop() ?? "";
  return FIELD_NAMES.includes(field) ? (field as Path<RegisterValues>) : null;
}

export function RegisterForm() {
  const { register: registerSociety } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { societyName: "", firstName: "", lastName: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
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
        return;
      }
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          const field = formFieldOf(fieldError.path);
          if (field) setError(field, { message: "Valore non valido" });
        }
      }
      setFormError(describeError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Input
        label="Nome della società"
        autoComplete="organization"
        required
        error={errors.societyName?.message}
        {...register("societyName")}
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
      <Button type="submit" size="lg" fullWidth loading={isSubmitting} leftIcon={<Rocket />}>
        Crea la società
      </Button>
      <p className="text-center text-sm text-fg-muted">
        Hai già un account?{" "}
        <Link href="/login" className="font-semibold text-primary-fg underline-offset-4 hover:underline">
          Accedi
        </Link>
      </p>
    </form>
  );
}
