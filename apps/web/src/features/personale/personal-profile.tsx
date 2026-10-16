"use client";

import { Bell, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, DataBoundary, EmptyState, SectionHeading } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { describeRoles } from "@/features/shell/role-labels";
import { useMember } from "@/features/tesserati/api";
import { formatDateOnly, teamLabel } from "@/features/tesserati/document-format";
import { usePermission } from "@/hooks/use-permission";
import { AddChildDialog } from "./add-child-dialog";
import { ContactForm } from "./contact-form";
import { PasswordForm } from "./password-form";
import { useSubjectChoice } from "./subject-picker";
import { usePersonalSubjects, type Subject } from "./subjects";

function Fact({ label, children }: { label: string; children: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{children ?? "Non indicato"}</dd>
    </div>
  );
}

function SubjectData({ subject }: { subject: Subject }) {
  const member = useMember(subject.memberId);
  const data = member.data;
  return (
    <Card as="section" aria-label={`Dati di ${subject.name}`} className="flex flex-col gap-6">
      <h2 className="text-lg font-bold tracking-title text-fg">{subject.isSelf ? "I tuoi dati" : `Dati di ${subject.name}`}</h2>
      <DataBoundary
        isLoading={member.isLoading}
        error={member.error}
        onRetry={() => void member.refetch()}
        isEmpty={!data}
        loadingLabel="Caricamento dei dati"
        skeletonRows={3}
        empty={<EmptyState icon={UserRound} title="Dati non disponibili" description="Riprova tra qualche istante." />}
      >
        {data ? (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Nome">{`${data.firstName} ${data.lastName}`}</Fact>
              <Fact label="Data di nascita">{data.birthDate ? formatDateOnly(data.birthDate) : null}</Fact>
              <Fact label="Codice fiscale">{data.fiscalCode}</Fact>
              <Fact label="Ruolo in campo">{data.fieldRole}</Fact>
              <Fact label="Squadre">{data.teams.length > 0 ? data.teams.map(teamLabel).join(", ") : null}</Fact>
            </dl>
            <p className="text-sm text-fg-muted">
              Nome, data di nascita e squadre li gestisce la società: se c&apos;è un errore scrivi alla segreteria. Telefono, email e indirizzo li aggiorni tu.
            </p>
            <ContactForm key={data.updatedAt} member={data} />
          </>
        ) : null}
      </DataBoundary>
    </Card>
  );
}

function Children({ subjects }: { subjects: readonly Subject[] }) {
  const [adding, setAdding] = useState(false);
  const children = subjects.filter((subject) => !subject.isSelf);
  return (
    <Card as="section" aria-labelledby="children-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="children-title" className="text-lg font-bold tracking-title text-fg">
          I tuoi figli
        </h2>
        <Button variant="secondary" size="sm" leftIcon={<UserPlus />} onClick={() => setAdding(true)}>
          Aggiungi un figlio
        </Button>
      </div>
      {children.length === 0 ? (
        <p className="text-sm text-fg-muted">Non hai ancora aggiunto nessun figlio.</p>
      ) : (
        <ul aria-label="Figli" className="flex flex-col gap-1 text-sm font-semibold text-fg">
          {children.map((child) => (
            <li key={child.memberId}>{child.name}</li>
          ))}
        </ul>
      )}
      <AddChildDialog open={adding} onOpenChange={setAdding} />
    </Card>
  );
}

/** Profile: the data of the people the user looks after, the account with its password, and the children. */
export function PersonalProfile() {
  const { me } = useAuth();
  const subjects = usePersonalSubjects();
  const { subject, picker } = useSubjectChoice(subjects);
  const canAddChildren = usePermission("children:create");
  if (!me) return null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Profilo"
        title="I tuoi dati, sempre aggiornati."
        highlight="sempre aggiornati."
        description="Telefono, email e indirizzo servono alla società per avvisarti. Li cambi qui, senza chiamare nessuno."
      />
      {picker}
      {subject ? <SubjectData key={subject.memberId} subject={subject} /> : null}
      {canAddChildren ? <Children subjects={subjects} /> : null}

      <Card as="section" aria-labelledby="account-title" className="flex flex-col gap-4">
        <h2 id="account-title" className="text-lg font-bold tracking-title text-fg">
          Il tuo account
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Nome">{`${me.user.firstName} ${me.user.lastName}`}</Fact>
          <Fact label="Email di accesso">{me.user.email}</Fact>
          <Fact label="Società">{me.society.name}</Fact>
          <Fact label="Ruolo">{describeRoles(me.roles)}</Fact>
        </dl>
        <PasswordForm />
      </Card>

      <Card as="section" aria-labelledby="alerts-title" className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="alerts-title" className="text-lg font-bold tracking-title text-fg">
            Avvisi
          </h2>
          <p className="text-sm text-fg-muted">Scegli se ricevere gli avvisi nell&apos;app, per email o in entrambi i modi.</p>
        </div>
        <Link
          href="/area-personale/notifiche"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
        >
          <Bell aria-hidden="true" className="size-4" />
          Preferenze di notifica
        </Link>
      </Card>
    </div>
  );
}
