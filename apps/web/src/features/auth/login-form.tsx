"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "./auth-provider";
import { describeLoginError, SESSION_EXPIRED_MESSAGE, SESSION_EXPIRED_PARAM, SESSION_EXPIRED_VALUE } from "./login-errors";
import { PasswordInput } from "./password-input";
import { loginSchema, type LoginValues } from "./schemas";

export function LoginForm() {
  const { login } = useAuth();
  const sessionExpired = useSearchParams().get(SESSION_EXPIRED_PARAM) === SESSION_EXPIRED_VALUE;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login({ email: values.email.trim(), password: values.password });
    } catch (error) {
      setFormError(describeLoginError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {sessionExpired ? <Alert tone="info">{SESSION_EXPIRED_MESSAGE}</Alert> : null}
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={errors.email?.message}
        {...register("email")}
      />
      <PasswordInput
        label="Password"
        autoComplete="current-password"
        required
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" size="lg" fullWidth loading={isSubmitting} leftIcon={<LogIn />}>
        Accedi
      </Button>
      <p className="text-center text-sm text-fg-muted">
        Non hai ancora una società?{" "}
        <Link href="/registrazione" className="font-semibold text-primary-fg underline-offset-4 hover:underline">
          Registrala
        </Link>
      </p>
    </form>
  );
}
