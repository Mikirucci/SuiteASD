"use client";

import { ArrowLeft, Pencil, SearchX, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, DataBoundary, EmptyState, SectionHeading, Skeleton } from "@/components/ui";
import { usePermission } from "@/hooks/use-permission";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { useTeam } from "./api";
import { DeleteTeamDialog } from "./delete-team-dialog";
import { TeamRoster } from "./team-roster";
import { TeamAppointments, TeamFees } from "./team-side-panels";
import { TeamFormDialog } from "./team-form-dialog";
import { genderLabelOf } from "./team-format";
import type { Team } from "@/features/tesserati/types";

function BackLink() {
  return (
    <Link
      href="/squadre"
      className="touch-target -ml-2 inline-flex w-fit items-center gap-2 rounded-md px-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Tutte le squadre
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento della squadra" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-lg lg:col-span-2" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    </div>
  );
}

/** The quiet facts under the name: category, gender and how many members. */
function Facts({ team }: { team: Team }) {
  const facts = [team.category, genderLabelOf(team), pluralize(team.membersCount, "tesserato", "tesserati")].filter(
    (fact): fact is string => Boolean(fact),
  );
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg-muted">
      {facts.map((fact) => (
        <li key={fact}>{fact}</li>
      ))}
    </ul>
  );
}

/** One team: who plays in it, when it plays, and what it owes or has paid. Each block shows only what the role may read. */
export function TeamDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const canWrite = usePermission("teams:write");
  const canReadMembers = usePermission("members:read");
  const canReadEvents = usePermission("events:read");
  const canReadFees = usePermission("payments:read");
  const query = useTeam(id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const team = query.data;
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const hasSidePanels = canReadEvents || canReadFees;

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <DataBoundary
        isLoading={query.isPending}
        error={notFound ? null : query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!team}
        skeleton={<DetailSkeleton />}
        empty={
          <EmptyState
            as="h1"
            icon={SearchX}
            title="Squadra non trovata"
            description="Potrebbe essere stata eliminata."
          />
        }
      >
        {team ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-3">
                <SectionHeading as="h1" label="Squadra" title={team.name} description={team.description ?? undefined} />
                <Facts team={team} />
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
                    Modifica
                  </Button>
                  <Button variant="secondary" leftIcon={<Trash2 />} onClick={() => setDeleting(team)}>
                    Elimina
                  </Button>
                </div>
              ) : null}
            </div>

            {hasSidePanels ? (
              <div className={cn("grid gap-4", canReadEvents && canReadFees && "md:grid-cols-2")}>
                {canReadEvents ? <TeamAppointments teamId={team.id} /> : null}
                {canReadFees ? <TeamFees teamId={team.id} /> : null}
              </div>
            ) : null}

            {canReadMembers ? <TeamRoster team={team} showFees={canReadFees} canAddMembers={canWrite} /> : null}

            {canWrite ? (
              <>
                <TeamFormDialog open={editOpen} onOpenChange={setEditOpen} team={team} />
                <DeleteTeamDialog
                  team={deleting}
                  onClose={() => setDeleting(null)}
                  onDeleted={() => router.push("/squadre")}
                />
              </>
            ) : null}
          </>
        ) : null}
      </DataBoundary>
    </div>
  );
}
