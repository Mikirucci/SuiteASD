"use client";

import { AlertTriangle, Clock, Search, SearchX, UserPlus } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Avatar, Badge, Button, Chip, DataTable, EmptyState, Input, LoadMore, Skeleton } from "@/components/ui";
import type { DataTableColumn } from "@/components/ui";
import { fullNameOf } from "@/features/tesserati/document-format";
import { DocumentSummary } from "@/features/tesserati/document-summary";
import type { MemberListItem, Team } from "@/features/tesserati/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatEuro } from "@/lib/format";
import { useTeamRoster, useTeamUnpaidFees, type TeamUnpaidFees } from "./api";
import { AddMembersDialog } from "./add-members-dialog";

const MUTED = "text-fg-muted";

/** A dash on screen, the words for screen readers: keeps the narrow columns on one line. */
function Missing({ label }: { label: string }) {
  return (
    <span className={MUTED}>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Role and jersey of a member in this team; the role on the court of the member fills in when the team has none. */
function placementIn(member: MemberListItem, teamId: string) {
  const ref = member.teams.find((team) => team.id === teamId);
  return { role: ref?.position ?? member.fieldRole, jersey: ref?.jerseyNumber ?? null };
}

function QuotaCell({ memberId, fees }: { memberId: string; fees: TeamUnpaidFees }) {
  if (fees.isLoading) return <Skeleton className="h-6 w-20 rounded-full" />;
  if (fees.failed) return <span className={MUTED}>Non disponibile</span>;
  const unpaid = fees.byMember.get(memberId);
  if (!unpaid || (unpaid.overdueCents === 0 && unpaid.pendingCents === 0)) {
    return <Missing label="Nessuna in sospeso" />;
  }
  return (
    <span className="flex gap-1.5 max-md:flex-wrap md:justify-start">
      {unpaid.overdueCents > 0 ? (
        <Chip tone="danger" icon={<AlertTriangle />}>
          Scaduta {formatEuro(unpaid.overdueCents)}
        </Chip>
      ) : null}
      {unpaid.pendingCents > 0 ? (
        <Chip tone="warning" icon={<Clock />}>
          Da pagare {formatEuro(unpaid.pendingCents)}
        </Chip>
      ) : null}
    </span>
  );
}

function columnsFor(teamId: string, fees: TeamUnpaidFees | null): DataTableColumn<MemberListItem>[] {
  const columns: DataTableColumn<MemberListItem>[] = [
    {
      key: "member",
      header: "Tesserato",
      nowrap: true,
      cell: (member) => (
        <span className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <Link
            href={`/tesserati/${member.id}`}
            className="inline-flex items-center gap-3 rounded-sm font-bold text-fg underline-offset-4 hover:underline"
          >
            <Avatar name={fullNameOf(member)} size="sm" decorative />
            {fullNameOf(member)}
          </Link>
          {member.status === "INACTIVE" ? <Badge variant="neutral">Non attivo</Badge> : null}
        </span>
      ),
    },
    {
      key: "role",
      header: "Ruolo",
      nowrap: true,
      cell: (member) => placementIn(member, teamId).role ?? <Missing label="Non indicato" />,
    },
    {
      key: "jersey",
      header: "Maglia",
      nowrap: true,
      cell: (member) => {
        const { jersey } = placementIn(member, teamId);
        return jersey === null ? <Missing label="Non assegnata" /> : `n. ${jersey}`;
      },
    },
    {
      key: "documents",
      header: "Documenti",
      nowrap: true,
      cell: (member) => (
        <span className="flex gap-1.5 max-md:flex-wrap md:justify-start">
          <DocumentSummary indicators={member.documents} />
        </span>
      ),
    },
  ];
  if (fees) {
    columns.push({
      key: "quota",
      header: "Quota",
      nowrap: true,
      cell: (member) => <QuotaCell memberId={member.id} fees={fees} />,
    });
  }
  return columns;
}

export interface TeamRosterProps {
  team: Team;
  /** Show who still has fees to pay. */
  showFees: boolean;
  /** Offer the form to add athletes to the team. */
  canAddMembers: boolean;
}

/** The roster of a team: members with role, jersey, documents and fees, searchable by name. */
export function TeamRoster({ team, showFees, canAddMembers }: TeamRosterProps) {
  const headingId = useId();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const debounced = useDebouncedValue(search);
  // Emptying the box applies at once; typing waits for a pause so that the server is not asked at every key
  const q = search === "" ? "" : debounced.trim();
  const roster = useTeamRoster(team.id, q, true);
  const fees = useTeamUnpaidFees(team.id, showFees);
  const searching = search.trim() !== "";
  const showSearch = searching || (roster.items?.length ?? 0) > 0;

  const empty = q ? (
    <EmptyState
      icon={SearchX}
      title="Nessun tesserato trovato"
      description="Prova con un altro nome."
      action={
        <Button variant="secondary" onClick={() => setSearch("")}>
          Azzera la ricerca
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={UserPlus}
      title="Nessun tesserato in questa squadra"
      description={
        canAddMembers
          ? "Scegli i tesserati da mettere in squadra: li cerchi per nome e li aggiungi tutti insieme."
          : "La segreteria non ha ancora assegnato nessun tesserato a questa squadra."
      }
      action={
        canAddMembers ? (
          <Button leftIcon={<UserPlus />} onClick={() => setAdding(true)}>
            Aggiungi atleti
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 id={headingId} className="text-lg font-bold tracking-title text-fg">
          Rosa
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {showSearch ? (
            <Input
              label="Cerca nella rosa"
              hideLabel
              type="search"
              placeholder="Cerca per nome o cognome"
              leadingIcon={<Search />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="sm:w-72"
            />
          ) : null}
          {canAddMembers && showSearch ? (
            <Button leftIcon={<UserPlus />} onClick={() => setAdding(true)} className="shrink-0">
              Aggiungi atleti
            </Button>
          ) : null}
        </div>
      </div>
      <DataTable
        label={`Rosa di ${team.name}`}
        rows={roster.items}
        columns={columnsFor(team.id, showFees ? fees : null)}
        getKey={(member) => member.id}
        isLoading={roster.isLoading}
        error={roster.error}
        onRetry={roster.refetch}
        scrollX
        loadingLabel="Caricamento della rosa"
        skeletonRows={5}
        empty={empty}
      />
      <LoadMore list={roster} noun="Tesserati" moreLabel="Carica altri tesserati" />
      {canAddMembers ? <AddMembersDialog team={team} open={adding} onOpenChange={setAdding} /> : null}
    </section>
  );
}
