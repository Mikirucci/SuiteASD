"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PillFilter } from "@/components/ui/pill-filter";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { PlayedMatchesView } from "./played-matches-view";
import { PlayerReport } from "./player-report";
import { PlayersOverview } from "./players-overview";

function OwnReports() {
  const { me } = useAuth();
  const people = [
    ...(me?.member ? [{ id: me.member.id, name: `${me.member.firstName} ${me.member.lastName}` }] : []),
    ...(me?.children ?? []).map((child) => ({ id: child.memberId, name: `${child.firstName} ${child.lastName}` })),
  ];
  const [chosen, setChosen] = useState<string | null>(null);
  const current = people.find((person) => person.id === chosen) ?? people[0];

  if (!current) {
    return (
      <EmptyState
        icon={Lock}
        title="Nessuna pagella collegata al tuo account"
        description="La segreteria deve collegare il tuo account a una scheda tesserato: poi qui vedi voti e statistiche."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {people.length > 1 ? (
        <PillFilter
          label="Scegli l'atleta"
          value={current.id}
          onChange={setChosen}
          options={people.map((person) => ({ value: person.id, label: person.name }))}
        />
      ) : null}
      <PlayerReport key={current.id} memberId={current.id} headingLevel="h2" />
    </div>
  );
}

export function PagellePage() {
  const { me } = useAuth();
  const isStaff = me?.permissions.includes("evaluations:read") ?? false;
  const isPlayer = me?.permissions.includes("evaluations:readOwn") ?? false;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        index={6}
        label="Pagelle e statistiche"
        title="Ogni partita, ogni giocatrice."
        highlight="ogni giocatrice."
        description={
          isStaff
            ? "Dopo la gara assegna voto e note, controlla le statistiche e pubblica: la giocatrice riceve la notifica."
            : "Voto, note dell'allenatore e statistiche di ogni gara, appena la pagella è pubblicata."
        }
      />
      {isStaff ? (
        <Tabs defaultValue="partite">
          <TabsList aria-label="Sezioni">
            <TabsTrigger className="h-11" value="partite">
              Partite
            </TabsTrigger>
            <TabsTrigger className="h-11" value="giocatrici">
              Giocatrici
            </TabsTrigger>
          </TabsList>
          <TabsContent value="partite">
            <PlayedMatchesView />
          </TabsContent>
          <TabsContent value="giocatrici">
            <PlayersOverview />
          </TabsContent>
        </Tabs>
      ) : isPlayer ? (
        <OwnReports />
      ) : (
        <EmptyState
          icon={Lock}
          title="Le pagelle sono riservate"
          description="Le vedono allenatori e amministratori; atleti e genitori vedono la propria."
        />
      )}
    </div>
  );
}
