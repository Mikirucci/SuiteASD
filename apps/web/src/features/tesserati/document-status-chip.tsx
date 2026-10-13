import { AlertTriangle, Check, Clock, X } from "lucide-react";
import type { ReactNode } from "react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { DOCUMENT_STATUS_LABEL } from "./document-format";
import type { DocumentStatus } from "./types";

const CONFIG: Record<DocumentStatus, { tone: ChipTone; icon: ReactNode }> = {
  OK: { tone: "success", icon: <Check strokeWidth={3} /> },
  EXPIRING: { tone: "warning", icon: <Clock /> },
  EXPIRED: { tone: "danger", icon: <AlertTriangle /> },
  MISSING: { tone: "danger", icon: <X strokeWidth={3} /> },
};

/** Document status as icon + text: colour is never the only signal. */
export function DocumentStatusChip({ status, className }: { status: DocumentStatus; className?: string }) {
  const { tone, icon } = CONFIG[status];
  return (
    <Chip tone={tone} icon={icon} className={className}>
      {DOCUMENT_STATUS_LABEL[status]}
    </Chip>
  );
}
