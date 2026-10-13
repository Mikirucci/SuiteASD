import Link from "next/link";
import { AutoChip } from "@/components/ui/chip";
import { ButtonLink } from "@/components/ui/button-link";
import { describeExpiry } from "@/features/tesserati/document-format";
import type { ExpirationItem } from "./types";

/** Detail of the selected timeline avatar: "Sara Conti · Certificato medico — Scade tra 15 giorni". */
export function ExpirationDetail({ item }: { item: ExpirationItem }) {
  const name = `${item.firstName} ${item.lastName}`;
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <p aria-live="polite" className="text-base text-fg">
          <span className="font-bold">
            {name} · {item.documentType.name}
          </span>
          <span className="text-fg-muted"> — {describeExpiry(item.daysRemaining)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <AutoChip />
          <p className="text-sm text-fg-muted">
            {item.firstName} e i genitori ricevono un promemoria per il rinnovo, prima e dopo la scadenza. Le soglie si
            impostano in{" "}
            <Link href="/automazioni" className="font-semibold text-primary-fg underline-offset-4 hover:underline">
              Automazioni
            </Link>
            .
          </p>
        </div>
      </div>
      <ButtonLink href={`/tesserati/${item.memberId}`} variant="secondary" className="shrink-0">
        Apri la scheda
      </ButtonLink>
    </div>
  );
}
