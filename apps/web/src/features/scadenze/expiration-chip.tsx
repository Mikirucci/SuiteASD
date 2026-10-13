import { AlertTriangle, Check, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { describeExpiry } from "@/features/tesserati/document-format";
import type { ExpirationItem, ExpirationStatus } from "./types";

const CONFIG: Record<ExpirationStatus, { tone: ChipTone; icon: ReactNode }> = {
  OK: { tone: "success", icon: <Check strokeWidth={3} /> },
  EXPIRING: { tone: "warning", icon: <Clock /> },
  EXPIRED: { tone: "danger", icon: <AlertTriangle /> },
};

/** "Scade tra 15 giorni" / "Scaduto da 3 giorni", with icon and tone from the status. */
export function ExpirationChip({
  item,
  className,
}: {
  item: Pick<ExpirationItem, "status" | "daysRemaining">;
  className?: string;
}) {
  const { tone, icon } = CONFIG[item.status];
  return (
    <Chip tone={tone} icon={icon} className={className}>
      {describeExpiry(item.daysRemaining)}
    </Chip>
  );
}
