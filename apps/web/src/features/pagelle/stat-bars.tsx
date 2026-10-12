import { ProgressBar } from "@/components/ui/progress-bar";
import { STAT_LABELS } from "./rating";
import type { StatLine } from "./types";

export interface StatBarsProps {
  stats: StatLine;
  /** Highest value of each statistic in the squad: the longest bar of that row. */
  maxima: StatLine;
  /** Accessible list name, e.g. "Statistiche di Giulia Rossi". */
  label: string;
}

/** One labelled bar per statistic; bars are relative to the best value of the squad in that match. */
export function StatBars({ stats, maxima, label }: StatBarsProps) {
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {STAT_LABELS.map(({ key, label: statLabel }) => (
        <li key={key} className="flex flex-col gap-1">
          {/* The progressbar below already announces the name and the value */}
          <div aria-hidden="true" className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-fg-muted">{statLabel}</span>
            <span className="text-sm font-bold tabular-nums text-fg">{stats[key]}</span>
          </div>
          <ProgressBar
            label={statLabel}
            value={stats[key]}
            max={Math.max(maxima[key], 1)}
            valueText={String(stats[key])}
            className="h-1.5"
          />
        </li>
      ))}
    </ul>
  );
}

/** Highest value of every statistic among the players with statistics. */
export function maximaOf(lines: readonly StatLine[]): StatLine {
  return {
    attackPoints: Math.max(0, ...lines.map((line) => line.attackPoints)),
    aces: Math.max(0, ...lines.map((line) => line.aces)),
    blocks: Math.max(0, ...lines.map((line) => line.blocks)),
    receptions: Math.max(0, ...lines.map((line) => line.receptions)),
    errors: Math.max(0, ...lines.map((line) => line.errors)),
  };
}
