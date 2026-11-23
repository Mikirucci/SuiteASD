import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

export const metadata: Metadata = { title: "Password dimenticata" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
