"use client";

import { Compass } from "lucide-react";
import { EmptyState, Reveal, SectionHeading } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { describeRoles } from "@/features/shell/role-labels";
import { GettingStarted } from "./getting-started";
import { useHomeAccess, useMembersSummary } from "./home-queries";
import { RestSection } from "./rest-section";
import { resolveOtherSections, resolveServices } from "./services";
import { ServicesSection } from "./services-section";
import { TodoSection } from "./todo-section";

/**
 * Home of the administration, in three levels: what needs doing now, the main services, the rest.
 * A society with no teams or no members gets the path "Per iniziare" instead. The dashboard does not wait for that check:
 * an established club sees its blocks at once (each with its own skeleton) and a new one is switched to the path as soon as
 * the first count arrives.
 */
export function HomeOverview() {
  const { me } = useAuth();
  const access = useHomeAccess();
  const summary = useMembersSummary(access.setup);
  if (!me) return null;

  const greeting = `Ciao ${me.user.firstName}, buon lavoro.`;
  const roles = `Accesso come ${describeRoles(me.roles).toLowerCase()}.`;
  const emptySociety = access.setup && summary.data !== undefined && (summary.data.squadre === 0 || summary.data.tesserati === 0);

  const header = (description: string) => (
    <SectionHeading as="h1" label={me.society.name} title={greeting} highlight="buon lavoro." description={`${roles} ${description}`.trim()} />
  );

  const permissions = me.permissions;
  const hasSomethingToShow =
    resolveServices(permissions).length > 0 ||
    resolveOtherSections(permissions).length > 0 ||
    access.competitions ||
    access.notifications ||
    access.automations;
  if (!hasSomethingToShow) {
    return (
      <div className="flex flex-col gap-8">
        {header("")}
        <EmptyState
          icon={Compass}
          title="Non ci sono ancora sezioni per te"
          description="Il tuo ruolo non apre nessuna sezione dell'amministrazione. Chiedi a chi gestisce la società di aggiornare i tuoi accessi."
        />
      </div>
    );
  }

  if (emptySociety && summary.data) {
    return (
      <div className="flex flex-col gap-8">
        {header("La società è nuova: cominciamo da qui.")}
        <Reveal>
          <GettingStarted summary={summary.data} mode="replace" />
        </Reveal>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {header("Prima ciò che richiede attenzione, poi i servizi di ogni giorno.")}
      {access.setup && summary.data ? <GettingStarted summary={summary.data} mode="strip" /> : null}
      <TodoSection access={access} />
      <ServicesSection />
      <RestSection />
    </div>
  );
}
