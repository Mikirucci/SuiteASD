import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/auth-frame";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Accedi" };

export default function LoginPage() {
  return (
    <>
      <AuthHeading title="Bentornato" description="Accedi per gestire la tua società." />
      <LoginForm />
    </>
  );
}
