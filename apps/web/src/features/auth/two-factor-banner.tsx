"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button-link";
import { formatInstantDay } from "@/lib/format";
import { useAuth } from "./auth-provider";

/**
 * Reminds the administration (administrator, secretary) to turn on the second step of the sign-in. Before the date it
 * only reminds; after it the API refuses invitations, account changes and the society data until it is on.
 */
export function TwoFactorBanner() {
  const { me } = useAuth();
  // Read once: whether the date has passed only changes the wording, the API decides what is refused
  const [now] = useState(() => Date.now());
  if (!me || !me.user.twoFactorRequired || me.user.twoFactorEnabled) return null;
  const graceEndsAt = me.user.twoFactorGraceEndsAt;
  const expired = graceEndsAt !== null && new Date(graceEndsAt).getTime() <= now;
  return (
    <section
      aria-label="Attiva la verifica in due passaggi"
      className="mb-6 flex flex-col gap-3 rounded-md bg-warning-soft p-4 text-sm text-fg ring-1 ring-inset ring-warning-line sm:flex-row sm:items-center"
    >
      <ShieldAlert aria-hidden="true" className="size-5 shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        <strong className="font-bold">Attiva la verifica in due passaggi.</strong>{" "}
        {expired
          ? "Con il tuo ruolo è obbligatoria: finché non la attivi non puoi gestire inviti, account e dati della società."
          : `Con il tuo ruolo è obbligatoria${graceEndsAt ? ` dal ${formatInstantDay(graceEndsAt)}` : ""}: dopo la password ti chiederemo un codice dall'app sul telefono.`}
      </p>
      <ButtonLink href="/account" variant="secondary" size="sm">
        Attivala ora
      </ButtonLink>
    </section>
  );
}
