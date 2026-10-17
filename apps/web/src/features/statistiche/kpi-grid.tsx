import { cn } from "@/lib/cn";
import { formatEuro, pluralize } from "@/lib/format";
import type { StatisticsOverview } from "./types";

interface Kpi {
  label: string;
  value: string;
  note: string;
  muted?: boolean;
}

function kpisOf({ members, fees, attendance }: StatisticsOverview): Kpi[] {
  const teams = members.byTeam.length;
  const hasAttendance = attendance.averagePercent !== null;
  return [
    {
      label: "Tesserati attivi",
      value: String(members.total),
      note: teams === 0 ? "nessuna squadra assegnata" : `${pluralize(teams, "squadra", "squadre")} con tesserati`,
    },
    { label: "Incassato", value: formatEuro(fees.collectedCents), note: "quote già pagate" },
    {
      label: "Da incassare",
      value: formatEuro(fees.toCollectCents),
      note: fees.overdueCents > 0 ? `di cui ${formatEuro(fees.overdueCents)} scaduti` : "nessuna quota scaduta",
    },
    {
      label: "Presenza media",
      value: hasAttendance ? `${attendance.averagePercent}%` : "Nessun dato",
      note: hasAttendance
        ? `Allenamenti degli ultimi 90 giorni, ${pluralize(attendance.recordsCount, "presenza registrata", "presenze registrate")}`
        : "Servono presenze registrate agli allenamenti.",
      muted: !hasAttendance,
    },
  ];
}

/** The four numbers to read first: equal columns, label always on top, context always below. */
export function KpiGrid({ data }: { data: StatisticsOverview }) {
  return (
    // gap-px over the line colour draws the dividers, whatever the number of columns
    <dl className="grid gap-px overflow-hidden rounded-lg bg-line shadow-soft sm:grid-cols-2 lg:grid-cols-4">
      {kpisOf(data).map(({ label, value, note, muted }) => (
        <div key={label} className="flex min-w-0 flex-col gap-1 bg-surface p-4 sm:p-6">
          <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</dt>
          <dd className={cn("break-words text-2xl font-extrabold tracking-title tabular-nums", muted ? "text-fg-muted" : "text-fg")}>{value}</dd>
          <dd className="text-sm text-fg-muted">{note}</dd>
        </div>
      ))}
    </dl>
  );
}
