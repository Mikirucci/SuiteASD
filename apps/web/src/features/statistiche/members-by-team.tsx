"use client";

import { Table2, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pluralize } from "@/lib/format";
import type { TeamCount } from "./types";

/** Active members per team: horizontal bars with the value written next to them, switchable to a plain table. */
export function MembersByTeam({ teams }: { teams: readonly TeamCount[] }) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...teams.map((team) => team.count));

  if (teams.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nessun tesserato in squadra"
        description="Assegna i tesserati a una squadra dalla scheda del tesserato: qui compare quanti sono per squadra."
      />
    );
  }

  return (
    <Card as="section" aria-labelledby="members-by-team-title">
      <CardHeader
        as="h2"
        title={<span id="members-by-team-title">Tesserati per squadra</span>}
        description="Solo i tesserati attivi."
        action={
          <Button variant="ghost" size="sm" leftIcon={<Table2 />} onClick={() => setAsTable((current) => !current)}>
            {asTable ? "Mostra come grafico" : "Mostra come tabella"}
          </Button>
        }
      />
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
            {teams.map((team) => (
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
        <ul aria-label="Tesserati per squadra" className="flex flex-col gap-4">
          {teams.map((team) => (
            <li key={team.teamId} className="flex flex-col gap-1.5">
              {/* The progressbar announces name and value: the visible row is not read twice */}
              <div aria-hidden="true" className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold text-fg">{team.teamName}</span>
                <span className="text-sm font-bold tabular-nums text-fg">{team.count}</span>
              </div>
              <ProgressBar
                label={team.teamName}
                value={team.count}
                max={max}
                valueText={pluralize(team.count, "tesserato", "tesserati")}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
