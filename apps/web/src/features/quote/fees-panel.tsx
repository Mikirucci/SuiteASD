"use client";

import { Search, Wallet } from "lucide-react";
import { useState } from "react";
import { Button, DataList, EmptyState, LoadMore, PillFilter, type PillOption } from "@/components/ui";
import { usePermission } from "@/hooks/use-permission";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { FeeRow } from "./fee-row";
import type { Fee } from "./types";
import { useFeeDialogs } from "./use-fee-dialogs";
import { useQuoteAccess } from "./use-quote-access";

const PAGE_SIZE = 25;

const PAYER_OPTIONS: readonly PillOption[] = [
  { value: "all", label: "Tutte" },
  { value: "PENDING", label: "In attesa" },
  { value: "OVERDUE", label: "Scaduto" },
  { value: "PAID", label: "Pagato" },
];

/** The fees of an athlete or of a guardian's children: status, "Ho pagato" and receipts. Staff use the plans overview instead. */
export function FeesPanel() {
  const { isGuardian } = useQuoteAccess();
  const canClaim = usePermission("payments:claim");
  const [status, setStatus] = useState("all");
  const { openDetail, startClaim, dialogs } = useFeeDialogs({ viewer: "payer", canWrite: false });

  const fees = useCursorQuery<Fee>(["fees", { status }], "/fees", {
    status: status === "all" ? undefined : status,
    limit: PAGE_SIZE,
  });

  const empty =
    status !== "all" ? (
      <EmptyState
        icon={Search}
        title="Nessuna quota con questo stato"
        description="Prova con un altro stato."
        action={
          <Button variant="secondary" onClick={() => setStatus("all")}>
            Mostra tutte le quote
          </Button>
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
      <PillFilter label="Filtra per stato" options={PAYER_OPTIONS} value={status} onChange={setStatus} />

      <section aria-label="Elenco quote" className="flex flex-col gap-3">
        <DataList
          label="Quote"
          items={fees.items}
          getKey={(fee) => fee.id}
          renderItem={(fee) => (
            <FeeRow fee={fee} onOpen={openDetail} viewer="payer" nameMember={isGuardian} onClaim={canClaim ? startClaim : undefined} />
          )}
          isLoading={fees.isLoading}
          error={fees.error}
          onRetry={fees.refetch}
          loadingLabel="Caricamento delle quote"
          empty={empty}
        />
        <LoadMore list={fees} noun="Quote" moreLabel="Mostra altre quote" />
      </section>

      {dialogs}
    </div>
  );
}
