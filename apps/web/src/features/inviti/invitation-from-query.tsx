"use client";

import { MailX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { AcceptInvitationPage } from "./accept-invitation-page";

/** Reads the token of the invitation from the address, as the email link carries it. */
export function InvitationFromQuery() {
  const token = useSearchParams().get("token");
  if (!token) {
    return (
      <EmptyState
        icon={MailX}
        title="Invito non utilizzabile"
        description="Nel link manca il codice dell'invito. Controlla di averlo copiato per intero o chiedi a chi ti ha invitato di mandartelo di nuovo."
        action={
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
          >
            Vai all&apos;accesso
          </Link>
        }
      />
    );
  }
  return <AcceptInvitationPage token={token} />;
}
