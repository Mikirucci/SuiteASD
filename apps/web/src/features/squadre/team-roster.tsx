"use client";

import { AlertTriangle, Clock, Search, SearchX, UserPlus } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Avatar, Badge, Button, ButtonLink, Chip, DataTable, EmptyState, Input, LoadMore, Skeleton } from "@/components/ui";
import type { DataTableColumn } from "@/components/ui";
import { fullNameOf } from "@/features/tesserati/document-format";
import { DocumentSummary } from "@/features/tesserati/document-summary";
import type { MemberListItem, Team } from "@/features/tesserati/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatEuro } from "@/lib/format";
import { useTeamRoster, useTeamUnpaidFees, type TeamUnpaidFees } from "./api";

const MUTED = "text-fg-muted";

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
    return <span className={MUTED}>Nessuna in sospeso</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5 md:justify-start">
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
      cell: (member) => (
        <span className="flex flex-wrap items-center gap-2">
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
      cell: (member) => placementIn(member, teamId).role ?? <span className={MUTED}>Non indicato</span>,
    },
    {
      key: "jersey",
      header: "Maglia",
      cell: (member) => {
        const { jersey } = placementIn(member, teamId);
        return jersey === null ? <span className={MUTED}>Non assegnata</span> : `n. ${jersey}`;
      },
    },
    {
      key: "documents",
      header: "Documenti",
      cell: (member) => (
        <span className="flex flex-wrap gap-1.5 md:justify-start">
          <DocumentSummary indicators={member.documents} />
        </span>
      ),
    },
  ];
  if (fees) {
    columns.push({
      key: "quota",
      header: "Quota",
      cell: (member) => <QuotaCell memberId={member.id} fees={fees} />,
    });
  }
  return columns;
}

export interface TeamRosterProps {
  team: Team;
  /** Show who still has fees to pay. */
  showFees: boolean;
  /** Offer the way to add members (the Tesserati page). */
  canAddMembers: boolean;
}

/** The roster of a team: members with role, jersey, documents and fees, searchable by name. */
export function TeamRoster({ team, showFees, canAddMembers }: TeamRosterProps) {
  const headingId = useId();
  const [search, setSearch] = useState("");
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
          ? "Assegna la squadra dalla scheda di un tesserato, oppure manda un link d'iscrizione dalla pagina Tesserati."
          : "La segreteria non ha ancora assegnato nessun tesserato a questa squadra."
      }
      action={
        canAddMembers ? (
          <ButtonLink href="/tesserati" variant="secondary">
            Vai ai tesserati
          </ButtonLink>
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
        {showSearch ? (
          <Input
            label="Cerca nella rosa"
            hideLabel
            type="search"
            placeholder="Cerca per nome o cognome"
            leadingIcon={<Search />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="sm:w-80"
          />
        ) : null}
      </div>
      <DataTable
        label={`Rosa di ${team.name}`}
        rows={roster.items}
        columns={columnsFor(team.id, showFees ? fees : null)}
        getKey={(member) => member.id}
        isLoading={roster.isLoading}
        error={roster.error}
        onRetry={roster.refetch}
        loadingLabel="Caricamento della rosa"
        skeletonRows={5}
        empty={empty}
      />
      <LoadMore list={roster} noun="Tesserati" moreLabel="Carica altri tesserati" />
    </section>
  );
}
