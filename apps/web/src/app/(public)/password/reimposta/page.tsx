import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = { title: "Nuova password" };

export default function ResetPasswordPage() {
  // useSearchParams (the token of the link) needs a Suspense boundary for static rendering
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
