"use client";

import { ChevronRight, ClipboardList } from "lucide-react";
import { useState } from "react";
import { Avatar, DataBoundary, DataListRow, EmptyState, ProgressBar, Select } from "@/components/ui";
import { addDays, startOfDay } from "@/lib/dates";
import { useTeamAttendance } from "./api";
import { formatPercent, pluralize } from "./format";
import { MemberAttendanceDialog } from "./member-attendance-dialog";
import type { MemberRef } from "./types";

const PERIODS = [
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 90 giorni" },
  { value: "all", label: "Tutto lo storico" },
] as const;

export interface AttendanceSummaryViewProps {
  teamId: string;
}

/** Presence percentage of the team and of every athlete over a period; each athlete opens her own history. */
export function AttendanceSummaryView({ teamId }: AttendanceSummaryViewProps) {
  const [period, setPeriod] = useState<string>("30");
  const [opened, setOpened] = useState<MemberRef | null>(null);
  const from = period === "all" ? undefined : addDays(startOfDay(new Date()), -Number(period)).toISOString();
  const summary = useTeamAttendance(teamId, from);
  const data = summary.data;
  const members = [...(data?.members ?? [])].sort(
    (a, b) => a.member.lastName.localeCompare(b.member.lastName, "it") || a.member.firstName.localeCompare(b.member.firstName, "it"),
  );

  return (
    <div className="flex flex-col gap-4">
      <Select label="Periodo" options={PERIODS} value={period} onChange={(change) => setPeriod(change.target.value)} className="sm:max-w-xs" />
      <DataBoundary
        isLoading={summary.isLoading}
        error={summary.error}
        onRetry={() => void summary.refetch()}
        loadingLabel="Caricamento delle presenze"
        skeletonRows={4}
        isEmpty={!data || data.trainings === 0}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="Nessuna presenza registrata"
            description="Segna le presenze nel check-in: qui compaiono la percentuale della squadra e lo storico di ogni atleta."
          />
        }
      >
        {data ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 rounded-lg bg-surface p-4 shadow-soft">
              <p className="text-sm text-fg-muted">Presenza media della squadra</p>
              <p className="text-2xl font-extrabold tracking-title text-fg">{formatPercent(data.summary.percentage)}</p>
              <ProgressBar
                tone="success"
                value={data.summary.percentage ?? 0}
                label="Presenza media della squadra"
                valueText={formatPercent(data.summary.percentage)}
              />
              <p className="text-xs text-fg-muted">{pluralize(data.trainings, "allenamento con presenze segnate", "allenamenti con presenze segnate")}</p>
            </div>
            <ul aria-label="Presenze per atleta" className="flex flex-col gap-2">
              {members.map((row) => {
                const name = `${row.member.firstName} ${row.member.lastName}`;
                return (
                  <li key={row.member.id} className="rounded-lg bg-surface shadow-soft">
                    <button
                      type="button"
                      onClick={() => setOpened(row.member)}
                      className="block w-full rounded-lg text-left hover:bg-ink-50"
                    >
                      <DataListRow
                        leading={<Avatar name={name} decorative />}
                        title={name}
                        subtitle={row.total > 0 ? `${row.present} su ${row.total} allenamenti` : "Nessuna presenza segnata"}
                        trailing={
                          <>
                            <span className="text-sm font-bold tabular-nums text-fg">{formatPercent(row.percentage)}</span>
                            <ChevronRight aria-hidden="true" className="size-5 text-fg-subtle" />
                          </>
                        }
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </DataBoundary>
      <MemberAttendanceDialog member={opened} onClose={() => setOpened(null)} />
    </div>
  );
}
