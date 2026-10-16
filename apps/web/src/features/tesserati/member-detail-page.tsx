"use client";

import { ArrowLeft, Pencil, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { describeError } from "@/lib/api";
import { useDeleteMember, useMember, useTeams } from "./api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateOnly, fullNameOf, guardianRelationLabel, teamLabel } from "./document-format";
import { MemberDocuments } from "./member-documents";
import { MemberFormDialog } from "./member-form-dialog";
import type { MemberDetail } from "./types";
import { usePermission } from "@/hooks/use-permission";

const GENDER_LABEL = { FEMALE: "Femmina", MALE: "Maschio" } as const;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-fg-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-fg">{children ?? "—"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-6 first:pt-0 last:pb-0">
      <h2 className="mb-4 text-base font-bold tracking-title text-fg">{title}</h2>
      {children}
    </section>
  );
}

function ProfileSections({ member }: { member: MemberDetail }) {
  const birth = [member.birthDate ? formatDateOnly(member.birthDate) : null, member.birthPlace]
    .filter(Boolean)
    .join(" · ");
  const address = [member.address, [member.postalCode, member.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="divide-y divide-line">
      <Section title="Anagrafica">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Nato">{birth || null}</Fact>
          <Fact label="Sesso">{member.gender ? GENDER_LABEL[member.gender] : null}</Fact>
          <Fact label="Codice fiscale">{member.fiscalCode}</Fact>
          <Fact label="Iscritto dal">{member.joinedAt ? formatDateOnly(member.joinedAt) : null}</Fact>
          <Fact label="Indirizzo">{address || null}</Fact>
          <Fact label="Stato">{member.status === "ACTIVE" ? "Attivo" : "Non attivo"}</Fact>
        </dl>
      </Section>
      <Section title="Contatti">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Email">
            {member.email ? (
              <a
                href={`mailto:${member.email}`}
                className="font-semibold text-primary-fg underline-offset-4 hover:underline"
              >
                {member.email}
              </a>
            ) : null}
          </Fact>
          <Fact label="Telefono">
            {member.phone ? (
              <a
                href={`tel:${member.phone}`}
                className="font-semibold text-primary-fg underline-offset-4 hover:underline"
              >
                {member.phone}
              </a>
            ) : null}
          </Fact>
        </dl>
      </Section>
      <Section title="Squadre e ruolo">
        {member.teams.length > 0 ? (
          <ul aria-label="Squadre" className="mb-4 flex flex-wrap gap-2">
            {member.teams.map((team) => (
              <li key={team.id}>
                <Badge>
                  {teamLabel(team)}
                  {team.jerseyNumber !== null ? ` · n. ${team.jerseyNumber}` : ""}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-fg-muted">Non è ancora in nessuna squadra.</p>
        )}
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Ruolo in campo">{member.fieldRole}</Fact>
          <Fact label="Taglia divisa">{member.kitSize}</Fact>
        </dl>
      </Section>
      <Section title="Genitori collegati">
        {member.guardians.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {member.guardians.map((guardian) => (
              <li key={guardian.linkId} className="flex items-center gap-3">
                <Avatar name={`${guardian.firstName} ${guardian.lastName}`} size="sm" decorative />
                <span className="text-sm font-semibold text-fg">
                  {guardian.firstName} {guardian.lastName}
                </span>
                <span className="text-sm text-fg-muted">{guardianRelationLabel(guardian.relation)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">Nessun genitore collegato.</p>
        )}
      </Section>
      {member.notes ? (
        <Section title="Note interne">
          <p className="whitespace-pre-line text-sm text-fg">{member.notes}</p>
        </Section>
      ) : null}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento della scheda" className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}

/** Member profile: personal data, contacts, guardians, teams and documents. */
export function MemberDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = usePermission("members:write");
  const query = useMember(id);
  const teams = useTeams();
  const remove = useDeleteMember();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const member = query.data;

  function confirmDelete() {
    if (!member) return;
    remove.mutate(member.id, {
      onSuccess: () => {
        toast({ title: "Tesserato eliminato", description: fullNameOf(member), tone: "success" });
        router.push("/tesserati");
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/tesserati"
        className="touch-target -ml-2 inline-flex w-fit items-center gap-2 rounded-md px-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Tutti i tesserati
      </Link>

      <DataBoundary
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!member}
        skeleton={<DetailSkeleton />}
        empty={
          <EmptyState
            as="h1"
            icon={UserX}
            title="Tesserato non trovato"
            description="Potrebbe essere stato eliminato."
          />
        }
      >
        {member ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={fullNameOf(member)} size="xl" decorative />
                <SectionHeading as="h1" label="Scheda tesserato" title={fullNameOf(member)} />
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
                    Modifica
                  </Button>
                  <Button variant="secondary" leftIcon={<Trash2 />} onClick={() => setDeleteOpen(true)}>
                    Elimina
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Card padding="md">
                <ProfileSections member={member} />
              </Card>
              <Card padding="md">
                <MemberDocuments memberId={member.id} indicators={member.documents} canWrite={canWrite} />
              </Card>
            </div>

            {canWrite ? (
              <>
                <MemberFormDialog
                  open={editOpen}
                  onOpenChange={setEditOpen}
                  teams={teams.data?.data ?? []}
                  member={member}
                />
                <ConfirmDialog
                  open={deleteOpen}
                  onOpenChange={(open) => {
                    setDeleteOpen(open);
                    if (!open) remove.reset();
                  }}
                  title={`Eliminare ${fullNameOf(member)}?`}
                  description="Vengono cancellati anche i documenti e i file allegati. L'operazione non si può annullare."
                  confirmLabel="Elimina tesserato"
                  onConfirm={confirmDelete}
                  loading={remove.isPending}
                  error={remove.error ? describeError(remove.error) : null}
                />
              </>
            ) : null}
          </>
        ) : null}
      </DataBoundary>
    </div>
  );
}
