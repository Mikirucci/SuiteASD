import { Lock } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";

/** Shown in place of a section the role of the user cannot use (they typed the address by hand). */
export function NoAccess() {
  return (
    <EmptyState
      as="h1"
      icon={Lock}
      title="Non hai accesso a questa sezione"
      description="Il tuo ruolo non prevede questa parte del gestionale. Se pensi sia un errore, chiedi a un amministratore della società."
      action={<ButtonLink href="/">Torna alla home</ButtonLink>}
    />
  );
}
