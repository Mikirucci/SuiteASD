"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  Clock,
  FileCheck,
  Lock,
  PauseCircle,
  Play,
  Receipt,
  RefreshCw,
  ScrollText,
  Send,
  SlidersHorizontal,
  Trophy,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { AutoChip, Button, Chip, Switch, useToast, type ChipTone } from "@/components/ui";
import { useApiMutation } from "@/lib/api";
import { configFieldsOf, summarizeConfig } from "./config";
import { describeAutomationError, describeResult, describeTrigger, formatDateTime, STATE_LABELS } from "./format";
import type { Automation, AutomationPatch, AutomationRun, AutomationState } from "./types";

const ICONS: Record<string, LucideIcon> = {
  "fee-reminders": Wallet,
  "certificate-reminders": FileCheck,
  "convocation-dispatch": Send,
  standings: Trophy,
  receipts: Receipt,
  "notifications-dispatch": Bell,
};

const STATE_CHIPS: Record<AutomationState, { tone: ChipTone; icon: ReactNode }> = {
  COMPLETED: { tone: "success", icon: <Check strokeWidth={3} /> },
  WAITING: { tone: "brand", icon: <Clock /> },
  RUNNING: { tone: "brand", icon: <RefreshCw /> },
  FAILED: { tone: "danger", icon: <AlertTriangle /> },
  DISABLED: { tone: "neutral", icon: <PauseCircle /> },
};

export interface AutomationRowProps {
  automation: Automation;
  canWrite: boolean;
  onConfigure: (automation: Automation) => void;
  onShowRuns: (automation: Automation) => void;
}

/** One activity of the checklist: state, what it does, its settings, and the controls the user is allowed to use. */
export function AutomationRow({ automation, canWrite, onConfigure, onShowRuns }: AutomationRowProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const Icon = ICONS[automation.key] ?? Zap;
  const stateChip = STATE_CHIPS[automation.state];
  const trigger = describeTrigger(automation);
  const settings = summarizeConfig(automation.key, automation.config);
  const configurable = configFieldsOf(automation.key).length > 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["automations"] });
  // Set in the same event as the click so the switch never snaps back while the request is in flight.
  const [requestedEnabled, setRequestedEnabled] = useState<boolean | null>(null);

  const toggle = useApiMutation(
    (patch: AutomationPatch, client) => client.patch<Automation>(`/automations/${automation.key}`, patch),
    {
      onSuccess: (saved) => {
        void refresh().then(() => setRequestedEnabled(null));
        toast({ title: saved.enabled ? "Attività attivata" : "Attività disattivata", description: saved.name, tone: "success" });
      },
      onError: (error) => {
        setRequestedEnabled(null);
        toast({ title: "Non è stato possibile cambiare lo stato", description: describeAutomationError(error), tone: "danger" });
      },
    },
  );

  const runNow = useApiMutation((_: void, client) => client.post<AutomationRun>(`/automations/${automation.key}/run`), {
    onSuccess: (run) => {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ["automation-runs", automation.key] });
      if (run.status === "FAILED") {
        toast({ title: "Esecuzione non riuscita", description: "Controlla il registro per i dettagli.", tone: "danger" });
        return;
      }
      const counters = describeResult(run.result);
      toast({
        title: "Esecuzione completata",
        description: counters.length > 0 ? counters.join(" · ") : "Non c'era nulla da fare.",
        tone: "success",
      });
    },
    onError: (error) => toast({ title: "Esecuzione non avviata", description: describeAutomationError(error), tone: "danger" }),
  });

  const enabled = requestedEnabled ?? automation.enabled;
  const showSwitch = canWrite && automation.toggleable;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-fg">
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-base font-bold tracking-title text-fg">{automation.name}</h3>
            <div className="flex flex-wrap items-center gap-2">
              {automation.enabled ? <AutoChip /> : null}
              <Chip tone={stateChip.tone} icon={stateChip.icon}>
                {STATE_LABELS[automation.state]}
              </Chip>
            </div>
          </div>
          <p className="text-sm text-fg-muted">{automation.description}</p>
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-sm text-fg-muted">
        {trigger ? (
          <div className="flex items-start gap-2">
            <dt className="sr-only">Quando parte</dt>
            <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <dd>{trigger}</dd>
          </div>
        ) : null}
        {automation.lastRunAt ? (
          <div className="flex items-start gap-2">
            <dt className="sr-only">Ultima esecuzione</dt>
            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <dd>
              Ultima esecuzione: <time dateTime={automation.lastRunAt}>{formatDateTime(automation.lastRunAt)}</time>
            </dd>
          </div>
        ) : null}
        {settings.map((line) => (
          <div key={line} className="flex items-start gap-2">
            <dt className="sr-only">Impostazione</dt>
            <SlidersHorizontal aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <dd>{line}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {showSwitch ? (
          <Switch
            label="Attiva"
            aria-label={`Attiva ${automation.name}`}
            checked={enabled}
            disabled={toggle.isPending}
            onChange={(event) => {
              setRequestedEnabled(event.target.checked);
              toggle.mutate({ enabled: event.target.checked });
            }}
          />
        ) : !automation.toggleable ? (
          <p className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted">
            <Lock aria-hidden="true" className="size-4" />
            Sempre attiva
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canWrite && configurable ? (
            <Button variant="secondary" leftIcon={<SlidersHorizontal />} onClick={() => onConfigure(automation)}>
              Impostazioni<span className="sr-only">: {automation.name}</span>
            </Button>
          ) : null}
          {canWrite && automation.runnable && automation.enabled ? (
            <Button variant="soft" leftIcon={<Play />} loading={runNow.isPending} onClick={() => runNow.mutate()}>
              Esegui ora<span className="sr-only">: {automation.name}</span>
            </Button>
          ) : null}
          <Button variant="ghost" leftIcon={<ScrollText />} onClick={() => onShowRuns(automation)}>
            Registro<span className="sr-only">: {automation.name}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
