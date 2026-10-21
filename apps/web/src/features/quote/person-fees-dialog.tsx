"use client";

import { Wallet } from "lucide-react";
import { DataList, Dialog, DialogContent, EmptyState, LoadMore } from "@/components/ui";
import { formatEuro } from "@/lib/format";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { FeeRow } from "./fee-row";
import { useFeeDialogs } from "./use-fee-dialogs";
import type { Fee, PlanPerson } from "./types";

interface ContentProps {
  planId: string;
  planName: string;
  person: PlanPerson;
  canWrite: boolean;
}

function PersonFeesContent({ planId, planName, person, canWrite }: ContentProps) {
  const fees = useCursorQuery<Fee>(["fees", "person", person.memberId, planId], "/fees", {
    memberId: person.memberId,
    feePlanId: planId,
    limit: 50,
  });
  const { openDetail, startPay, dialogs } = useFeeDialogs({ viewer: "secretariat", canWrite });
  const planDue = person.totalDueCents > 0 ? `${formatEuro(person.totalDueCents)} da pagare in questo piano` : "Nulla da pagare in questo piano";
  const due =
    person.allPlansDueCents > person.totalDueCents ? `${planDue} · ${formatEuro(person.allPlansDueCents)} in totale` : planDue;
  return (
    <DialogContent className="max-w-2xl" title={`Quote di ${person.memberName}`} description={`${due} · ${planName}`}>
      <div className="flex flex-col gap-3">
        <DataList
          label={`Quote di ${person.memberName}`}
          items={fees.items}
          getKey={(fee) => fee.id}
          renderItem={(fee) => <FeeRow fee={fee} viewer="secretariat" onOpen={openDetail} onPay={canWrite ? startPay : undefined} />}
          isLoading={fees.isLoading}
          error={fees.error}
          onRetry={fees.refetch}
          loadingLabel="Caricamento delle quote"
          empty={<EmptyState className="shadow-none" icon={Wallet} title="Nessuna quota" description="In questo piano non ci sono quote per questa persona." />}
        />
        <LoadMore list={fees} noun="Quote" moreLabel="Mostra altre quote" />
      </div>
      {dialogs}
    </DialogContent>
  );
}

export interface PersonFeesDialogProps {
  planId: string;
  planName: string;
  person: PlanPerson | null;
  canWrite: boolean;
  onClose: () => void;
}

/** The fees of one person inside a plan, with the quick actions of each (card, register payment, receipt). */
export function PersonFeesDialog({ planId, planName, person, canWrite, onClose }: PersonFeesDialogProps) {
  if (!person) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <PersonFeesContent planId={planId} planName={planName} person={person} canWrite={canWrite} />
    </Dialog>
  );
}
