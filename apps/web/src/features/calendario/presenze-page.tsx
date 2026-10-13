"use client";

import { ArrowLeft, Lock, Users } from "lucide-react";
import { useState } from "react";
import {
  ButtonLink,
  DataBoundary,
  EmptyState,
  SectionHeading,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { useCalendarTeams } from "./api";
import { AttendanceSummaryView } from "./attendance-summary-view";
import { CheckInView } from "./check-in-view";
import { useCalendarAccess } from "./use-calendar-access";

/** Attendance at trainings: quick check-in for the coach, history and percentages for the staff. */
export function PresenzePage() {
  const access = useCalendarAccess();
  const teams = useCalendarTeams();
  const [chosenTeamId, setChosenTeamId] = useState<string | null>(null);
  const teamList = teams.data ?? [];
  const teamId = chosenTeamId ?? teamList[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <ButtonLink href="/calendario" variant="ghost" className="self-start">
          <ArrowLeft aria-hidden="true" />
          Calendario
        </ButtonLink>
        <SectionHeading
          as="h1"
          index={4}
          label="Presenze agli allenamenti"
          title="Chi c'è, a colpo d'occhio."
          highlight="a colpo d'occhio."
          description="Segna chi è in palestra con un tocco. Lo storico e la percentuale di ogni atleta si aggiornano da soli."
        />
      </div>
      {access.canSeeAttendance ? (
        <DataBoundary
          isLoading={teams.isLoading}
          error={teams.error}
          onRetry={() => void teams.refetch()}
          loadingLabel="Caricamento delle squadre"
          skeletonRows={2}
          isEmpty={teamList.length === 0}
          empty={
            <EmptyState
              icon={Users}
              title="Nessuna squadra"
              description="Crea una squadra e assegna gli atleti dai tesserati: poi qui segni le presenze agli allenamenti."
            />
          }
        >
          <div className="flex flex-col gap-4">
            <Select
              className="sm:max-w-xs"
              label="Squadra"
              options={teamList.map((team) => ({ value: team.id, label: team.name }))}
              value={teamId ?? ""}
              onChange={(change) => setChosenTeamId(change.target.value)}
            />
            {teamId ? (
              <Tabs defaultValue="check-in">
                <TabsList aria-label="Sezioni delle presenze">
                  <TabsTrigger className="h-11" value="check-in">
                    Check-in
                  </TabsTrigger>
                  <TabsTrigger className="h-11" value="storico">
                    Storico e percentuali
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="check-in">
                  <CheckInView key={teamId} teamId={teamId} canCheckIn={access.canCheckIn} />
                </TabsContent>
                <TabsContent value="storico">
                  <AttendanceSummaryView key={teamId} teamId={teamId} />
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </DataBoundary>
      ) : (
        <EmptyState
          icon={Lock}
          title="Le presenze sono riservate"
          description="Le vedono allenatori, segreteria e amministratori."
        />
      )}
    </div>
  );
}
