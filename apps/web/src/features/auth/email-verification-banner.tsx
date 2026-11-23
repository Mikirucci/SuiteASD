"use client";

import { MailWarning } from "lucide-react";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";
import { describeError } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { resendEmailVerification } from "./recovery-api";

/**
 * A quiet reminder at the top of the page while the email of the signed-in person is not confirmed. It never blocks
 * anything: the API only refuses sending invitations and publishing announcements, and says so when asked.
 */
export function EmailVerificationBanner() {
  const { me } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  if (!me || me.user.emailVerified !== false) return null;

  async function resend() {
    setSending(true);
    try {
      await resendEmailVerification();
      toast({ title: "Email inviata", description: `Controlla la posta di ${me?.user.email ?? "il tuo indirizzo"}.`, tone: "success" });
    } catch (error) {
      toast({ title: "Non siamo riusciti a inviarla", description: describeError(error), tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="Verifica la tua email" className="mb-6 flex flex-col gap-3 rounded-md bg-warning-soft p-4 text-sm text-fg ring-1 ring-inset ring-warning-line sm:flex-row sm:items-center">
      <MailWarning aria-hidden="true" className="size-5 shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        <strong className="font-bold">Verifica la tua email.</strong> Ti abbiamo scritto un link per confermare l&apos;indirizzo: finché non lo apri non
        puoi invitare persone né pubblicare comunicazioni.
      </p>
      <Button variant="secondary" size="sm" loading={sending} onClick={() => void resend()}>
        Reinvia l&apos;email
      </Button>
    </section>
  );
}
