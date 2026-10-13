import { AlertTriangle, Check, Clock, X } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import type { CertificateStatus } from "./types";

const STATUSES: ReadonlyArray<{ status: CertificateStatus; label: string; tone: ChipTone; icon: ReactNode }> = [
  { status: "OK", label: "In regola", tone: "success", icon: <Check strokeWidth={3} /> },
  { status: "EXPIRING", label: "In scadenza", tone: "warning", icon: <Clock /> },
  { status: "EXPIRED", label: "Scaduti", tone: "danger", icon: <AlertTriangle /> },
  { status: "MISSING", label: "Mancanti", tone: "danger", icon: <X strokeWidth={3} /> },
];

/** Medical certificates of the active members by status: four figures, each with its icon and label. */
export function CertificatesCard({ counts }: { counts: Record<CertificateStatus, number> }) {
  return (
    <Card as="section" aria-labelledby="certificates-title">
      <CardHeader as="h2" title={<span id="certificates-title">Certificati medici</span>} description="Stato dei certificati dei tesserati attivi." />
      <dl className="grid grid-cols-2 gap-4">
        {STATUSES.map(({ status, label, tone, icon }) => (
          <div key={status} className="flex flex-col items-start gap-2">
            <dt>
              <Chip tone={tone} icon={icon}>
                {label}
              </Chip>
            </dt>
            <dd className="text-2xl font-extrabold tracking-title tabular-nums text-fg">{counts[status]}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
