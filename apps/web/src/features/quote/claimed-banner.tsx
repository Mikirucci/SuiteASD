"use client";

import { Alert, Button } from "@/components/ui";
import { useApiQuery } from "@/lib/api";
import { pluralize } from "@/lib/format";
import type { CursorPage, Fee } from "./types";

const COUNT_LIMIT = 100;

export interface ClaimedBannerProps {
  /** Opens the list of the reported fees. */
  onShow: () => void;
}

/**
 * Tells the secretariat that payers reported payments still to be checked. Silent while loading, on error and when
 * there is nothing to check: the cards below have their own states, and this is only a shortcut to the work waiting.
 */
export function ClaimedBanner({ onShow }: ClaimedBannerProps) {
  const claimed = useApiQuery<CursorPage<Fee>>(["fees", "claimed-count"], "/fees", {
    query: { claimed: true, limit: COUNT_LIMIT },
  });
  const count = claimed.data?.data.length ?? 0;
  if (count === 0 || !claimed.data) return null;

  const total = claimed.data.page.hasMore ? `Oltre ${COUNT_LIMIT} quote segnalate` : pluralize(count, "quota segnalata", "quote segnalate");
  return (
    <Alert tone="info">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0">
          <span className="font-bold">{total} dal pagante.</span> Controlla il conto e registra i pagamenti.
        </p>
        <Button variant="secondary" onClick={onShow}>
          Mostra le segnalate
        </Button>
      </div>
    </Alert>
  );
}
