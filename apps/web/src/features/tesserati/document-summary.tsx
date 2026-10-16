import { AlertTriangle, Check, Clock } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { expiringLabel, missingLabel, summarizeDocuments } from "./document-format";
import type { DocumentIndicator } from "./types";

/**
 * Document state of a member at a glance: a red chip with how many documents are missing, an amber one for those
 * about to expire, a green "In regola" when everything is fine. The names are in the title and read by screen readers.
 */
export function DocumentSummary({ indicators }: { indicators: readonly DocumentIndicator[] }) {
  const { missing, expiring } = summarizeDocuments(indicators);
  if (missing.length === 0 && expiring.length === 0) {
    return (
      <Chip tone="success" icon={<Check strokeWidth={3} />}>
        In regola
      </Chip>
    );
  }
  return (
    <>
      {missing.length > 0 ? (
        <Chip tone="danger" icon={<AlertTriangle />} title={`Mancanti o scaduti: ${missing.join(", ")}`}>
          {missingLabel(missing.length)}
          <span className="sr-only">: {missing.join(", ")}</span>
        </Chip>
      ) : null}
      {expiring.length > 0 ? (
        <Chip tone="warning" icon={<Clock />} title={`In scadenza: ${expiring.join(", ")}`}>
          {expiringLabel(expiring.length)}
          <span className="sr-only">: {expiring.join(", ")}</span>
        </Chip>
      ) : null}
    </>
  );
}
