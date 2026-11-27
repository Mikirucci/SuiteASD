"use client";

import { ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, describeError } from "@/lib/api";

const APP_CODE = /^\d{6}$/;
const RECOVERY_CODE = /^[A-Za-z0-9]{4}(-?[A-Za-z0-9]{4}){3}$/;

/** What the person reads when the code is refused; null means the challenge is over and they must sign in again. */
function describeVerifyError(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.code === "invalid_two_factor_code") return "Codice non corretto. Controlla l'app e riprova.";
    if (error.code === "invalid_two_factor_challenge") return null;
  }
  return describeError(error);
}

interface TwoFactorStepProps {
  /** Opens the session with the code; rejects with the API error. */
  onVerify: (code: string) => Promise<void>;
  /** The challenge expired or was cancelled: back to the start of the sign-in. */
  onRestart: (message: string) => void;
}

/**
 * The second step of a sign-in: the six digits of the authenticator app, or one of the recovery codes for who lost the
 * phone. The password was already right; nothing is signed in until the code is.
 */
export function TwoFactorStep({ onVerify, onRestart }: TwoFactorStepProps) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim().replace(/\s/g, "");
    const valid = useRecovery ? RECOVERY_CODE.test(value) : APP_CODE.test(value);
    if (!valid) {
      setError(useRecovery ? "Scrivi un codice di recupero, per esempio ABCD-EFGH-IJKL-MNOP." : "Scrivi le 6 cifre che vedi nell'app.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onVerify(value);
    } catch (failure) {
      const message = describeVerifyError(failure);
      if (message === null) {
        onRestart("Il tempo per inserire il codice è finito. Accedi di nuovo.");
        return;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode() {
    setUseRecovery((current) => !current);
    setCode("");
    setError(null);
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-label="Verifica in due passaggi" className="flex flex-col gap-5">
      <Alert tone="info">
        {useRecovery
          ? "Scrivi uno dei codici di recupero che hai salvato quando hai attivato la verifica. Ogni codice vale una volta."
          : "Apri l'app di autenticazione sul telefono e scrivi il codice di 6 cifre di SuiteASD."}
      </Alert>
      {useRecovery ? (
        <Input
          key="recovery"
          label="Codice di recupero"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={error ?? undefined}
        />
      ) : (
        <Input
          key="app"
          label="Codice dell'app"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={error ?? undefined}
        />
      )}
      <Button type="submit" size="lg" fullWidth loading={submitting} leftIcon={<ShieldCheck />}>
        Verifica
      </Button>
      <button
        type="button"
        onClick={switchMode}
        className="min-h-11 self-center rounded-md px-3 text-sm font-semibold text-primary-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {useRecovery ? "Usa il codice dell'app" : "Hai perso il telefono? Usa un codice di recupero"}
      </button>
    </form>
  );
}
