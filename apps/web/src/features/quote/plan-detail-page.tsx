"use client";

import { AlertTriangle, ArrowLeft, Check, Clock, Coins, Hourglass, Pencil, Search, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, EmptyState, ErrorState, Input, PillFilter, SectionHeading, Select, Skeleton, StatTile, type PillOption } from "@/components/ui";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError, describeError } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { describePlan } from "./format";
import { useFeePlan, usePlanPeople, useQuoteTeams, type PlanPeopleFilters } from "./api";
import { PersonCard } from "./person-card";
import { PersonFeesDialog } from "./person-fees-dialog";
import { PlanFormDialog, type PlanDialogState } from "./plan-form-dialog";
import type { FeePlan, PersonPaymentStatus, PlanPerson, PlanStats } from "./types";
import { useQuoteAccess } from "./use-quote-access";

const STATUS_OPTIONS: readonly PillOption[] = [
  { value: "", label: "Tutti" },
  { value: "PAID", label: "In regola" },
  { value: "PENDING", label: "In attesa" },
  { value: "OVERDUE", label: "Scaduta" },
];

function BackLink() {
  return (
    <Link
      href="/quote"
      className="touch-target -ml-2 inline-flex w-fit items-center gap-2 rounded-md px-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Tutti i pagamenti
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento del piano" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/2" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-32 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Incassato, da incassare and the three previews of the plan, side by side in a grid. */
function PlanReport({ stats }: { stats: PlanStats }) {
  return (
    <section aria-label="Rendiconto del piano" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatTile label="Incassato" tone="success" icon={Coins} value={formatEuro(stats.incassatoCents)} />
      <StatTile
        label="Da incassare"
        icon={Hourglass}
        value={formatEuro(stats.daIncassareCents)}
        note={stats.scadutoCents > 0 ? `di cui ${formatEuro(stats.scadutoCents)} scaduti` : undefined}
      />
      <StatTile label="In regola" tone="success" icon={Check} value={stats.paidPeople} note={pluralize(stats.paidPeople, "persona", "persone")} />
      <StatTile label="In attesa" tone="warning" icon={Clock} value={stats.pendingPeople} note={pluralize(stats.pendingPeople, "persona", "persone")} />
      <StatTile
        label="Quote scadute"
        tone="danger"
        icon={AlertTriangle}
        value={stats.overduePeople}
        note={pluralize(stats.overduePeople, "persona", "persone")}
        className="col-span-2 lg:col-span-1"
      />
    </section>
  );
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function PlanPeopleSection({ plan }: { plan: FeePlan }) {
  const { canWrite } = useQuoteAccess();
  const [search, setSearch] = useState("");
  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState<PersonPaymentStatus | "">("");
  const q = useDebouncedValue(search.trim());
  const filters: PlanPeopleFilters = { q, teamId, status };
  const people = usePlanPeople(plan.id, filters);
  const teams = useQuoteTeams();
  const [open, setOpen] = useState<PlanPerson | null>(null);
  const [form, setForm] = useState<PlanDialogState | null>(null);

  const hasFilters = search.trim() !== "" || teamId !== "" || status !== "";
  const resetFilters = () => {
    setSearch("");
    setTeamId("");
    setStatus("");
  };
  const teamOptions = [{ value: "", label: "Tutte le squadre" }, ...(teams.items ?? []).map((team) => ({ value: team.id, label: team.name }))];

  if (people.isLoading) return <DetailSkeleton />;
  if (people.error || !people.data) {
    return (
      <ErrorState
        title={isNotFound(people.error) ? "Piano non trovato" : "Piano non disponibile"}
        message={describeError(people.error)}
        onRetry={isNotFound(people.error) ? undefined : () => void people.refetch()}
      />
    );
  }

  const { stats, people: list } = people.data;
  const planIsEmpty = stats.paidPeople + stats.pendingPeople + stats.overduePeople === 0;

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeading as="h1" label="Piano" title={plan.name} description={describePlan(plan, teams.items ?? [], Infinity)} />
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" leftIcon={<Pencil />} onClick={() => setForm({ mode: "edit", plan })}>
              Modifica
            </Button>
          </div>
        ) : null}
      </div>

      <PlanReport stats={stats} />

      <section aria-labelledby="people-heading" className="flex flex-col gap-4">
        <h2 id="people-heading" className="text-lg font-bold tracking-title text-fg">
          Persone
        </h2>
        {planIsEmpty && !hasFilters ? (
          <EmptyState
            icon={Users}
            title="Nessuna quota in questo piano"
            description="Nessun tesserato attivo nelle squadre del piano quando è stato creato: le quote nascono insieme al piano."
          />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Cerca un tesserato"
                  type="search"
                  leadingIcon={<Search />}
                  placeholder="Nome o cognome"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Select label="Squadra" options={teamOptions} value={teamId} onChange={(event) => setTeamId(event.target.value)} />
              </div>
              <PillFilter
                label="Filtra per situazione"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(value) => setStatus(value === "PAID" || value === "PENDING" || value === "OVERDUE" ? value : "")}
              />
            </div>
            {list.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Nessuno con questi filtri"
                description="Prova con un'altra situazione o un'altra squadra, oppure togli la ricerca."
                action={
                  <Button variant="secondary" onClick={resetFilters}>
                    Azzera i filtri
                  </Button>
                }
              />
            ) : (
              <ul aria-label="Persone del piano" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((person) => (
                  <PersonCard key={person.memberId} person={person} onOpen={setOpen} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <PersonFeesDialog planId={plan.id} planName={plan.name} person={open} canWrite={canWrite} onClose={() => setOpen(null)} />
      <PlanFormDialog state={form} teams={teams.items ?? []} onClose={() => setForm(null)} />
    </>
  );
}

/** One plan of the payments: its report and its people, with search and filters that only apply here. */
export function PlanDetailPage({ id }: { id: string }) {
  const plan = useFeePlan(id);
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      {plan.isLoading ? <DetailSkeleton /> : null}
      {plan.error ? (
        <ErrorState
          title={isNotFound(plan.error) ? "Piano non trovato" : "Piano non disponibile"}
          message={describeError(plan.error)}
          onRetry={isNotFound(plan.error) ? undefined : () => void plan.refetch()}
        />
      ) : null}
      {plan.data ? <PlanPeopleSection plan={plan.data} /> : null}
    </div>
  );
}
