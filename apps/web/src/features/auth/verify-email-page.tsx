"use client";

import { MailCheck, MailX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui";
import { ApiError, describeError } from "@/lib/api";
import { AuthHeading } from "./auth-frame";
import { useAuth } from "./auth-provider";
import { verifyEmail } from "./recovery-api";

type State = { step: "checking" } | { step: "done" } | { step: "invalid" } | { step: "failed"; message: string };

const linkClasses =
  "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary-fg hover:bg-primary-soft";

/**
 * The page the confirmation link opens. It checks the token once, as soon as it loads (the link is single use, so a
 * second call from a strict-mode remount must not happen), and tells what came of it.
 */
export function VerifyEmailPage() {
  const token = useSearchParams().get("token");
  const { status, refresh } = useAuth();
  const [state, setState] = useState<State>(token ? { step: "checking" } : { step: "invalid" });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then(() => setState({ step: "done" }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "invalid_verification_token") setState({ step: "invalid" });
        else setState({ step: "failed", message: describeError(error) });
      });
  }, [token]);

  const done = state.step === "done";
  useEffect(() => {
    // A signed-in person sees the banner go away without reloading
    if (done && status === "authenticated") void refresh();
  }, [done, status, refresh]);

  if (state.step === "checking") {
    return (
      <div role="status" className="flex flex-col gap-2 py-6 text-center">
        <p className="text-lg font-bold text-fg">Stiamo verificando la tua email…</p>
        <p className="text-sm text-fg-muted">Ci vuole un momento.</p>
      </div>
    );
  }
  if (state.step === "done") {
    return (
      <EmptyState
        icon={MailCheck}
        title="Email verificata"
        description="Grazie: il tuo indirizzo è confermato e puoi usare tutto."
        action={
          <Link href={status === "authenticated" ? "/" : "/login"} className={linkClasses}>
            {status === "authenticated" ? "Vai all'app" : "Vai all'accesso"}
          </Link>
        }
      />
    );
  }
  if (state.step === "invalid") {
    return (
      <EmptyState
        icon={MailX}
        title="Link non valido o scaduto"
        description="Il link vale 3 giorni e si usa una sola volta. Accedi e, dal banner in alto, richiedine uno nuovo."
        action={
          <Link href="/login" className={linkClasses}>
            Vai all&apos;accesso
          </Link>
        }
      />
    );
  }
  return (
    <>
      <AuthHeading title="Non siamo riusciti a verificare" description={state.message} />
      <Link href="/login" className={linkClasses}>
        Vai all&apos;accesso
      </Link>
    </>
  );
}
