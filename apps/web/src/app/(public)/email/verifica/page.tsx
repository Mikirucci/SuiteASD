import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailPage } from "@/features/auth/verify-email-page";

export const metadata: Metadata = { title: "Verifica l'email" };

export default function VerifyEmailRoutePage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPage />
    </Suspense>
  );
}
