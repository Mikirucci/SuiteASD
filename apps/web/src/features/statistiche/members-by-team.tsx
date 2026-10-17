"use client";

import { BarChart3, Table2, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pluralize } from "@/lib/format";
import { sortTeams } from "./ordering";
import { StatSection } from "./stat-section";
import type { TeamCount } from "./types";

const HINT = "Ogni barra è lunga in proporzione alla squadra più numerosa. Chi è in più squadre compare in ognuna.";

/** Active members per team, largest first: bars with the value written next to them, switchable to a plain table. */
export function MembersByTeam({ teams, className }: { teams: readonly TeamCount[]; className?: string }) {
  const [asTable, setAsTable] = useState(false);
  const sorted = sortTeams(teams);
  const max = Math.max(1, ...sorted.map((team) => team.count));

  if (sorted.length === 0) {
    return (
      <StatSection title="Tesserati per squadra" hint={HINT} className={className}>
        <EmptyState
          as="h3"
          icon={Users}
          title="Nessun tesserato in squadra"
          description="Assegna i tesserati a una squadra dalla scheda del tesserato: qui compare quanti sono per squadra."
        />
      </StatSection>
    );
  }

  return (
    <StatSection
      title="Tesserati per squadra"
      hint={HINT}
      className={className}
      action={
        <Button variant="ghost" size="sm" leftIcon={asTable ? <BarChart3 /> : <Table2 />} onClick={() => setAsTable((current) => !current)}>
          {asTable ? "Mostra come grafico" : "Mostra come tabella"}
        </Button>
      }
    >
      <Card>
        {asTable ? (
          <table aria-label="Tesserati per squadra" className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 text-xs font-bold uppercase tracking-label text-fg-muted">
                  Squadra
                </th>
                <th scope="col" className="py-2 text-right text-xs font-bold uppercase tracking-label text-fg-muted">
                  Tesserati
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((team) => (
                <tr key={team.teamId} className="border-b border-line last:border-b-0">
                  <th scope="row" className="py-3 font-semibold text-fg">
                    {team.teamName}
                  </th>
                  <td className="py-3 text-right font-bold tabular-nums text-fg">{team.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="flex flex-col gap-4">
            {sorted.map((team) => (
              <li key={team.teamId} className="flex flex-col gap-2">
                {/* The progressbar announces name and value: the visible row is not read twice */}
                <div aria-hidden="true" className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-fg">{team.teamName}</span>
                  <span className="text-lg font-extrabold tabular-nums text-fg">{team.count}</span>
                </div>
                <ProgressBar label={team.teamName} value={team.count} max={max} valueText={pluralize(team.count, "tesserato", "tesserati")} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </StatSection>
  );
}
