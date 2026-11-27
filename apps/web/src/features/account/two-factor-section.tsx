"use client";

import { Copy, Download, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Chip, Dialog, DialogClose, DialogContent, Input, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { PasswordInput } from "@/features/auth/password-input";
import { saveBlob } from "@/features/tesserati/api";
import { ApiError, describeError } from "@/lib/api";
import { formatInstantDay } from "@/lib/format";
import { useDisableTwoFactor, useEnableTwoFactor, useNewRecoveryCodes, useStartTwoFactor, type TwoFactorSetup } from "./two-factor-api";

const APP_CODE = /^\d{6}$/;

function describeCodeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "invalid_two_factor_code") return "Codice non corretto. Aspetta il prossimo codice dell'app e riprova.";
    if (error.code === "invalid_current_password") return "La password non è corretta.";
  }
  return describeError(error);
}

/** The ten recovery codes, shown once: copy them or save them as a file before closing. */
function RecoveryCodesList({ codes }: { codes: string[] }) {
  const { toast } = useToast();
  const text = codes.join("\n");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Codici copiati", tone: "success" });
    } catch {
      toast({ title: "Copia non riuscita", description: "Seleziona i codici e copiali a mano.", tone: "danger" });
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info">
        Salva questi codici in un posto sicuro: li vedi solo adesso. Se perdi il telefono, ognuno ti fa entrare una volta al
        posto del codice dell&apos;app.
      </Alert>
      <ul aria-label="Codici di recupero" className="grid grid-cols-1 gap-2 rounded-md bg-surface-muted p-4 font-mono text-sm text-fg sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Copy />} onClick={() => void copy()}>
          Copia
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Download />}
          onClick={() => saveBlob(new Blob([text], { type: "text/plain" }), "suiteasd-codici-di-recupero.txt")}
        >
          Scarica
        </Button>
      </div>
    </div>
  );
}

/** The QR code of the secret, drawn in the browser: the secret never leaves the page. */
function SecretQrCode({ setup }: { setup: TwoFactorSetup }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 192 })
      .then((url) => {
        if (active) setImage(url);
      })
      .catch(() => {
        if (active) setImage(null);
      });
    return () => {
      active = false;
    };
  }, [setup.otpauthUri]);
  return (
    <div className="flex flex-col items-center gap-3">
      {image ? (
        // A data URL drawn on the page: next/image adds nothing here
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="Codice QR da inquadrare con l'app di autenticazione" width={192} height={192} className="rounded-md" />
      ) : null}
      <p className="text-center text-sm text-fg-muted">
        Non riesci a inquadrarlo? Scrivi nell&apos;app questa chiave:
        <span className="mt-1 block break-all font-mono text-fg">{setup.secret}</span>
      </p>
    </div>
  );
}

function CodeInput({ value, onChange, error }: { value: string; onChange: (value: string) => void; error: string | null }) {
  return (
    <Input
      label="Codice dell'app"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      required
      value={value}
      onChange={(event) => onChange(event.target.value.trim())}
      error={error ?? undefined}
    />
  );
}

/** Scan, confirm with a code, save the recovery codes. */
function EnableDialog({ onClose }: { onClose: () => void }) {
  const { refresh } = useAuth();
  const start = useStartTwoFactor();
  const enable = useEnableTwoFactor();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutate: startSetup } = start;

  useEffect(() => {
    startSetup();
  }, [startSetup]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!APP_CODE.test(code)) {
      setError("Scrivi le 6 cifre che vedi nell'app.");
      return;
    }
    setError(null);
    enable.mutate(code, { onError: (failure) => setError(describeCodeError(failure)) });
  }

  function close() {
    if (enable.isSuccess) void refresh();
    onClose();
  }

  const codes = enable.data?.recoveryCodes;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        title={codes ? "Verifica attiva" : "Attiva la verifica in due passaggi"}
        description={
          codes
            ? "Da ora, dopo la password, ti chiederemo il codice dell'app."
            : "Installa un'app di autenticazione (Google Authenticator, Microsoft Authenticator, 1Password) e inquadra il codice."
        }
        scrollable
        footer={
          codes ? (
            <Button onClick={close}>Ho salvato i codici</Button>
          ) : (
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
          )
        }
      >
        {codes ? (
          <RecoveryCodesList codes={codes} />
        ) : start.error ? (
          <Alert tone="danger">{describeError(start.error)}</Alert>
        ) : start.data ? (
          <form onSubmit={submit} noValidate aria-label="Conferma il codice" className="flex flex-col gap-4">
            <SecretQrCode setup={start.data} />
            <CodeInput value={code} onChange={setCode} error={error} />
            <Button type="submit" loading={enable.isPending} leftIcon={<ShieldCheck />}>
              Conferma e attiva
            </Button>
          </form>
        ) : (
          <p className="text-sm text-fg-muted" role="status">
            Preparazione del codice…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Ten new recovery codes for a code of the app; the old ones stop working. */
function RecoveryCodesDialog({ onClose }: { onClose: () => void }) {
  const renew = useNewRecoveryCodes();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!APP_CODE.test(code)) {
      setError("Scrivi le 6 cifre che vedi nell'app.");
      return;
    }
    setError(null);
    renew.mutate(code, { onError: (failure) => setError(describeCodeError(failure)) });
  }

  const codes = renew.data?.recoveryCodes;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Nuovi codici di recupero"
        description="I codici che avevi non varranno più."
        scrollable
        footer={
          <DialogClose asChild>
            <Button variant={codes ? "primary" : "secondary"}>{codes ? "Ho salvato i codici" : "Annulla"}</Button>
          </DialogClose>
        }
      >
        {codes ? (
          <RecoveryCodesList codes={codes} />
        ) : (
          <form onSubmit={submit} noValidate aria-label="Genera nuovi codici" className="flex flex-col gap-4">
            <CodeInput value={code} onChange={setCode} error={error} />
            <Button type="submit" loading={renew.isPending} leftIcon={<KeyRound />}>
              Genera i codici
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Turns the second step off: the password and a code of the app, so a stolen session cannot do it. */
function DisableDialog({ required, onClose }: { required: boolean; onClose: () => void }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const disable = useDisableTwoFactor();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || !APP_CODE.test(code)) {
      setError("Servono la password e le 6 cifre dell'app.");
      return;
    }
    setError(null);
    disable.mutate(
      { password, code },
      {
        onSuccess: () => {
          void refresh();
          toast({ title: "Verifica in due passaggi disattivata", tone: "success" });
          onClose();
        },
        onError: (failure) => setError(describeCodeError(failure)),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Disattivare la verifica in due passaggi?"
        description="Per entrare basterà di nuovo la password."
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Annulla</Button>
          </DialogClose>
        }
      >
        <form onSubmit={submit} noValidate aria-label="Disattiva la verifica" className="flex flex-col gap-4">
          {required ? (
            <Alert tone="danger">Con il tuo ruolo è obbligatoria: senza, non potrai gestire inviti, account e dati della società.</Alert>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <CodeInput value={code} onChange={setCode} error={null} />
          <Button type="submit" variant="danger" loading={disable.isPending} leftIcon={<ShieldOff />}>
            Disattiva
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type OpenDialog = "enable" | "codes" | "disable" | null;

/**
 * The second step of the sign-in: a code from an app on the phone after the password. Required for the administration
 * (administrator, secretary), offered to everybody else.
 */
export function TwoFactorSection() {
  const { me } = useAuth();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  if (!me) return null;
  const { twoFactorEnabled: enabled, twoFactorRequired: required, twoFactorGraceEndsAt: graceEndsAt } = me.user;
  const close = () => setDialog(null);
  return (
    <section aria-labelledby="two-factor-title" className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="two-factor-title" className="text-base font-bold text-fg">
          Verifica in due passaggi
        </h3>
        {enabled ? <Chip tone="success">Attiva</Chip> : <Chip tone={required ? "warning" : "neutral"}>Non attiva</Chip>}
      </div>
      <p className="text-sm text-fg-muted">
        {enabled
          ? "Dopo la password ti chiediamo il codice dell'app di autenticazione: chi ruba la password da sola non entra."
          : required
            ? `Con il tuo ruolo è obbligatoria${graceEndsAt ? `: attivala entro il ${formatInstantDay(graceEndsAt)}` : ""}. Senza, non potrai gestire inviti, account e dati della società.`
            : "Dopo la password ti chiederemo un codice dall'app sul telefono: chi ruba la password da sola non entra."}
      </p>
      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <Button variant="secondary" size="sm" leftIcon={<KeyRound />} onClick={() => setDialog("codes")}>
              Nuovi codici di recupero
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<ShieldOff />} onClick={() => setDialog("disable")}>
              Disattiva
            </Button>
          </>
        ) : (
          <Button variant={required ? "primary" : "secondary"} size="sm" leftIcon={<ShieldCheck />} onClick={() => setDialog("enable")}>
            Attiva
          </Button>
        )}
      </div>
      {dialog === "enable" ? <EnableDialog onClose={close} /> : null}
      {dialog === "codes" ? <RecoveryCodesDialog onClose={close} /> : null}
      {dialog === "disable" ? <DisableDialog required={required} onClose={close} /> : null}
    </section>
  );
}
