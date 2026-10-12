"use client";

import { Search, Wallet } from "lucide-react";
import { useState } from "react";
import {
  Button,
  DataList,
  EmptyState,
  Input,
  PillFilter,
  Select,
  useToast,
  type PillOption,
} from "@/components/ui";
import { FeeDetailDialog } from "./fee-detail-dialog";
import { FeeRow } from "./fee-row";
import { FeesSummaryBar } from "./fees-summary";
import { LoadMore } from "./load-more";
import { PayFeeDialog } from "./pay-fee-dialog";
import type { Fee, TeamOption } from "./types";
import { useCursorQuery } from "./use-cursor-query";
import { useDebouncedValue } from "./use-debounced-value";
import { useQuoteAccess } from "./use-quote-access";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: readonly PillOption[] = [
  { value: "all", label: "Tutte" },
  { value: "PENDING", label: "In attesa" },
  { value: "OVERDUE", label: "Scaduto" },
  { value: "PAID", label: "Pagato" },
];

export function FeesPanel({ onOpenPlans }: { onOpenPlans?: () => void }) {
  const { canSeeAll, canWrite, isGuardian } = useQuoteAccess();
  const { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [teamId, setTeamId] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());
  const [detail, setDetail] = useState<Fee | null>(null);
  const [paying, setPaying] = useState<Fee | null>(null);

  const teams = useCursorQuery<TeamOption>(["quote-teams"], "/teams", { limit: 100 }, { enabled: canSeeAll });
  const fees = useCursorQuery<Fee>(
    ["fees", { status, teamId, q }],
    "/fees",
    { status: status === "all" ? undefined : status, teamId, q, limit: PAGE_SIZE },
  );

  const hasFilters = status !== "all" || teamId !== "" || search.trim() !== "";
  const resetFilters = () => {
    setStatus("all");
    setTeamId("");
    setSearch("");
  };

  const teamOptions = [
    { value: "", label: "Tutte le squadre" },
    ...(teams.items ?? []).map((team) => ({ value: team.id, label: team.name })),
  ];

  const empty = hasFilters ? (
    <EmptyState
      icon={Search}
      title="Nessuna quota con questi filtri"
      description="Prova con un altro stato o un'altra squadra, oppure togli la ricerca."
      action={
        <Button variant="secondary" onClick={resetFilters}>
          Azzera i filtri
        </Button>
      }
    />
  ) : canSeeAll ? (
    <EmptyState
      icon={Wallet}
      title="Nessuna quota ancora"
      description="Crea un piano quota e genera le quote per i tesserati: compariranno qui con il loro stato."
      action={
        canWrite && onOpenPlans ? (
          <Button onClick={onOpenPlans}>Vai ai piani quota</Button>
        ) : undefined
      }
    />
  ) : (
    <EmptyState
      icon={Wallet}
      title="Nessuna quota da mostrare"
      description={
        isGuardian
          ? "Quando la società assegna una quota ai tuoi figli la trovi qui, con le ricevute."
          : "Quando la società ti assegna una quota la trovi qui, con le ricevute."
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {canSeeAll ? <FeesSummaryBar teamId={teamId} /> : null}

      <div className="flex flex-col gap-3">
        <PillFilter label="Filtra per stato" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        {canSeeAll ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Squadra"
              options={teamOptions}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              hint={teams.error ? "Le squadre non sono disponibili al momento." : undefined}
            />
            <Input
              label="Cerca un tesserato"
              type="search"
              leadingIcon={<Search />}
              placeholder="Nome o cognome"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      <section aria-label="Elenco quote" className="flex flex-col gap-3">
        <DataList
          label="Quote"
          items={fees.items}
          getKey={(fee) => fee.id}
          renderItem={(fee) => <FeeRow fee={fee} onOpen={setDetail} />}
          isLoading={fees.isLoading}
          error={fees.error}
          onRetry={fees.refetch}
          loadingLabel="Caricamento delle quote"
          empty={empty}
        />
        <LoadMore list={fees} noun="Quote" moreLabel="Mostra altre quote" />
      </section>

      <FeeDetailDialog
        fee={detail}
        onClose={() => setDetail(null)}
        onPay={
          canWrite
            ? (fee) => {
                setDetail(null);
                setPaying(fee);
              }
            : undefined
        }
      />
      <PayFeeDialog
        fee={paying}
        onClose={() => setPaying(null)}
        onPaid={(paid) => {
          setPaying(null);
          setDetail(paid);
          toast({
            title: "Pagamento registrato",
            description: paid.receipt ? `Ricevuta n. ${paid.receipt.code} emessa per ${paid.memberName}.` : paid.memberName,
            tone: "success",
          });
        }}
      />
    </div>
  );
}
