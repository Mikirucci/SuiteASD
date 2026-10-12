import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/auth-frame";
import { RegisterForm } from "@/features/auth/register-form";

export const metadata: Metadata = { title: "Registra la società" };

export default function RegisterPage() {
  return (
    <>
      <AuthHeading title="Registra la tua società" description="Crea l'account amministratore: ci vuole un minuto." />
      <RegisterForm />
    </>
  );
}
