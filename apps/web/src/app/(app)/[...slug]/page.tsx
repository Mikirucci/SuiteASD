import { Compass } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Pagina non disponibile" };

/**
 * Fallback for any private route that has no page yet. A module's real page (a more specific
 * folder under (app)) always wins over this catch-all, so modules replace it simply by existing.
 */
export default function UnavailablePage() {
  return (
    <EmptyState
      as="h1"
      icon={Compass}
      title="Questa pagina non è ancora disponibile"
      description="La sezione che cerchi non esiste oppure è ancora in lavorazione. Torna alla home per scegliere un'altra sezione."
      action={<ButtonLink href="/" variant="secondary">Torna alla home</ButtonLink>}
    />
  );
}
