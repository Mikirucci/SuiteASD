"use client";

import { FileText } from "lucide-react";
import { EmptyState, SectionHeading } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { usePermission } from "@/hooks/use-permission";
import { PersonalAppointments } from "./personal-home-appointments";
import { SubjectTiles } from "./personal-home-tiles";
import { usePersonalSubjects } from "./subjects";

/** Home of the personal area: documents and payments at a glance, then the appointments where one answers. */
export function PersonalHome() {
  const { me } = useAuth();
  const subjects = usePersonalSubjects();
  const canRespond = usePermission("convocations:respond");
  if (!me) return null;

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        label={me.society.name}
        title={`Ciao ${me.user.firstName}, ecco la tua area.`}
        highlight="la tua area."
        description="Documenti e pagamenti in un colpo d'occhio, poi i prossimi appuntamenti: aprili per dire se ci sei."
      />
      {subjects.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nessun tesserato collegato al tuo account"
          description="Chiedi alla segreteria della società di collegare il tuo profilo, oppure iscriviti con il link che ti hanno dato."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {subjects.map((subject) => (
              <SubjectTiles key={subject.memberId} subject={subject} named={subjects.length > 1} />
            ))}
          </div>
          <PersonalAppointments subjects={subjects} canRespond={canRespond} />
        </>
      )}
    </div>
  );
}
