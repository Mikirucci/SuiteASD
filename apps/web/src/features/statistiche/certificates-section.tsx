import { AlertTriangle, Check, Clock, FileCheck, X } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { CERTIFICATE_ORDER } from "./ordering";
import { ShareBar, type ShareTone } from "./share-bar";
import { StatSection } from "./stat-section";
import type { CertificateStatus } from "./types";

const STATUSES: Record<CertificateStatus, { label: string; tone: ChipTone; bar: ShareTone; icon: ReactNode }> = {
  OK: { label: "In regola", tone: "success", bar: "success", icon: <Check strokeWidth={3} /> },
  EXPIRING: { label: "In scadenza", tone: "warning", bar: "warning", icon: <Clock /> },
  EXPIRED: { label: "Scaduti", tone: "danger", bar: "danger", icon: <AlertTriangle /> },
  MISSING: { label: "Mancanti", tone: "danger", bar: "danger", icon: <X strokeWidth={3} /> },
};

/** Medical certificates of the active members by status, the ones that need action first. */
export function CertificatesSection({ counts, className }: { counts: Record<CertificateStatus, number>; className?: string }) {
  const total = CERTIFICATE_ORDER.reduce((sum, status) => sum + counts[status], 0);

  return (
    <StatSection
      title="Certificati medici"
      hint="Ogni riga conta i tesserati attivi in quello stato. Scaduti e mancanti sono i primi da sistemare."
      className={className}
    >
      {total === 0 ? (
        <EmptyState
          as="h3"
          icon={FileCheck}
          title="Nessun certificato da controllare"
          description="I certificati compaiono qui appena ci sono tesserati attivi."
          className="flex-1 justify-center"
        />
      ) : (
        <Card className="flex-1">
          <ul className="flex flex-col gap-4">
            {CERTIFICATE_ORDER.map((status) => {
              const { label, tone, bar, icon } = STATUSES[status];
              return (
                <li key={status} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Chip tone={tone} icon={icon}>
                      {label}
                    </Chip>
                    <span className="text-lg font-extrabold tabular-nums text-fg">{counts[status]}</span>
                  </div>
                  <ShareBar ratio={counts[status] / total} tone={bar} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </StatSection>
  );
}
