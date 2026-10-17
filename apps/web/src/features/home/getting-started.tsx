"use client";

import { Check, Link2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { ButtonLink, Button, Card, Chip, ProgressBar, Skeleton } from "@/components/ui";
import { JoinLinksDialog } from "@/features/iscrizioni/join-links-dialog";
import { useTeams } from "@/features/tesserati/api";
import type { MemberSummary } from "@/features/tesserati/types";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { BlockError } from "./block-states";
import { useAnyEventProbe, useFeePlanProbe, useHomeAccess } from "./home-queries";

type StepState = "done" | "todo" | "loading" | "error";

interface Step {
  id: string;
  title: string;
  /** What the step is about, in a few words: it names the step once it is done ("squadre, tesserati e quote"). */
  topic: string;
  hint: string;
  doneHint: string;
  state: StepState;
  retry?: () => void;
  /** Actions of a step still to do: the next step to take gets the primary look, the others a quieter one. */
  actions: (variant: "primary" | "secondary") => ReactNode;
  /** Quiet way back to the page once the step is done. */
  doneLink: { label: string; href: string };
}

function probeState(probe: { isLoading: boolean; error: unknown; data?: { data: unknown[] } }): StepState {
  if (probe.isLoading) return "loading";
  if (probe.error) return "error";
  return (probe.data?.data.length ?? 0) > 0 ? "done" : "todo";
}

function StepMark({ number, state }: { number: number; state: StepState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold tabular-nums",
        state === "done" ? "bg-success text-white" : "border-2 border-line-control bg-surface text-fg",
      )}
    >
      {state === "done" ? <Check className="size-5" strokeWidth={3} /> : number}
    </span>
  );
}

function StepRow({ step, number, primary }: { step: Step; number: number; primary: boolean }) {
  const done = step.state === "done";
  return (
    <li className="flex gap-4 py-6 first:pt-0 last:pb-0">
      <StepMark number={number} state={step.state} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-bold text-fg">
            <span className="sr-only">{`Passo ${number}: `}</span>
            {step.title}
            {done ? (
              <Chip tone="success" icon={<Check strokeWidth={3} />}>
                Fatto
              </Chip>
            ) : null}
          </h3>
          <p className="max-w-prose text-sm text-fg-muted">{done ? step.doneHint : step.hint}</p>
        </div>
        {step.state === "loading" ? (
          <div role="status" aria-label="Controllo del passo">
            <Skeleton className="h-11 w-48" />
          </div>
        ) : null}
        {step.state === "error" && step.retry ? <BlockError what="questo passo" onRetry={step.retry} /> : null}
        {step.state === "todo" ? <div className="flex flex-wrap gap-3">{step.actions(primary ? "primary" : "secondary")}</div> : null}
        {done ? (
          <ButtonLink href={step.doneLink.href} variant="ghost" size="sm" className="w-fit">
            {step.doneLink.label}
          </ButtonLink>
        ) : null}
      </div>
    </li>
  );
}

/** A step still to do, in the compact path (shown only once every step is known): title, hint and the way in on one row from `sm` up. */
function PendingStepRow({ step, number, primary }: { step: Step; number: number; primary: boolean }) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-base font-bold text-fg">
          <span className="sr-only">{`Passo ${number}: `}</span>
          {step.title}
        </h3>
        <p className="max-w-prose text-sm text-fg-muted">{step.hint}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-3">{step.actions(primary ? "primary" : "secondary")}</div>
    </li>
  );
}

const listFormat = new Intl.ListFormat("it", { style: "long", type: "conjunction" });

export interface GettingStartedProps {
  summary: MemberSummary;
  /** "replace": the society is empty and this is the whole home. "strip": it sits above the dashboard until the last step. */
  mode: "replace" | "strip";
}

/** The path of a new society in four steps. Every state comes from the data, so nothing is stored to remember it. */
export function GettingStarted({ summary, mode }: GettingStartedProps) {
  const access = useHomeAccess();
  const teams = useTeams();
  const plans = useFeePlanProbe(access.payments);
  const events = useAnyEventProbe(access.events);
  const [linksOpen, setLinksOpen] = useState(false);
  const teamList = useMemo(() => teams.data?.data ?? [], [teams.data]);

  const candidates: Array<Step | null> = [
    access.teamsWrite
      ? {
          id: "team",
          topic: "squadre",
          title: "Crea la prima squadra",
          hint: "Le squadre raccolgono atleti, partite e quote. Per cominciare ne basta una.",
          doneHint: `Hai ${pluralize(summary.squadre, "squadra", "squadre")}.`,
          state: summary.squadre > 0 ? "done" : "todo",
          actions: (variant) => (
            <ButtonLink href="/squadre" variant={variant}>
              Crea una squadra
            </ButtonLink>
          ),
          doneLink: { label: "Apri le squadre", href: "/squadre" },
        }
      : null,
    access.members
      ? {
          id: "members",
          topic: "tesserati",
          title: "Aggiungi i tesserati",
          hint: "Inseriscili tu uno per uno, oppure manda un link: atleti e genitori si iscrivono da soli.",
          doneHint: `Hai ${pluralize(summary.tesserati, "tesserato", "tesserati")}.`,
          state: summary.tesserati > 0 ? "done" : "todo",
          actions: (variant) => (
            <>
              <ButtonLink href="/tesserati" variant={variant}>
                Aggiungi un tesserato
              </ButtonLink>
              {access.joinLinksWrite ? (
                <Button variant="secondary" leftIcon={<Link2 />} onClick={() => setLinksOpen(true)}>
                  Crea il link di iscrizione
                </Button>
              ) : null}
            </>
          ),
          doneLink: { label: "Apri i tesserati", href: "/tesserati" },
        }
      : null,
    access.payments
      ? {
          id: "fees",
          topic: "quote",
          title: "Imposta le quote",
          hint: "Scegli quanto costano iscrizione e mensilità: l'app prepara le quote e manda i promemoria.",
          doneHint: "Hai già un piano di quote.",
          state: probeState(plans),
          retry: () => void plans.refetch(),
          actions: (variant) => (
            <ButtonLink href="/quote" variant={variant}>
              Imposta le quote
            </ButtonLink>
          ),
          doneLink: { label: "Apri le quote", href: "/quote" },
        }
      : null,
    access.events
      ? {
          id: "event",
          topic: "calendario",
          title: "Pianifica la prima partita o il primo allenamento",
          hint: "Gli atleti vengono convocati e rispondono dal telefono.",
          doneHint: "Hai già un evento in calendario.",
          state: probeState(events),
          retry: () => void events.refetch(),
          actions: (variant) => (
            <ButtonLink href="/calendario" variant={variant}>
              Apri il calendario
            </ButtonLink>
          ),
          doneLink: { label: "Apri il calendario", href: "/calendario" },
        }
      : null,
  ];
  const steps = candidates.flatMap((step) => (step ? [step] : []));
  const done = steps.filter((step) => step.state === "done").length;

  // Above the dashboard the path must not flash and vanish: it shows only once every step is known and one is left
  if (mode === "strip" && (done === steps.length || steps.some((step) => step.state === "loading" || step.state === "error"))) return null;
  if (steps.length === 0) return null;

  const firstTodo = steps.find((step) => step.state === "todo");
  const progress = (
    <ProgressBar label="Passi completati" value={done} max={steps.length} tone="success" valueText={`${done} passi su ${steps.length}`} />
  );
  const joinLinks = access.joinLinksWrite ? <JoinLinksDialog open={linksOpen} onOpenChange={setLinksOpen} teams={teamList} /> : null;

  // Once the society runs, the path shrinks to what is left so the dashboard stays on the first screen
  if (mode === "strip") {
    const doneTopics = steps.filter((step) => step.state === "done").map((step) => step.topic);
    return (
      <section aria-labelledby="home-start" className="flex flex-col gap-4">
        <Card>
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="home-start" className="text-lg font-extrabold tracking-title text-fg">
                Per iniziare
              </h2>
              <p className="text-sm font-semibold text-fg">{`${done} su ${steps.length} fatti`}</p>
            </div>
            {progress}
            {doneTopics.length > 0 ? (
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <Check aria-hidden="true" className="size-4 shrink-0 text-success" strokeWidth={3} />
                {`Già fatti: ${listFormat.format(doneTopics)}`}
              </p>
            ) : null}
          </div>
          <ol className="flex flex-col divide-y divide-line">
            {steps.map((step, index) =>
              step.state === "done" ? null : <PendingStepRow key={step.id} step={step} number={index + 1} primary={step.id === firstTodo?.id} />,
            )}
          </ol>
        </Card>
        {joinLinks}
      </section>
    );
  }

  return (
    <section aria-labelledby="home-start" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="home-start" className="text-lg font-extrabold tracking-title text-fg">
          Per iniziare
        </h2>
        <p className="max-w-prose text-sm text-fg-muted">{`Ci sono ${steps.length} passi per avere la società pronta. Falli nell'ordine che preferisci.`}</p>
      </div>
      <Card>
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-sm font-semibold text-fg">{`${done} su ${steps.length} fatti`}</p>
          {progress}
        </div>
        <ol className="flex flex-col divide-y divide-line">
          {steps.map((step, index) => (
            <StepRow key={step.id} step={step} number={index + 1} primary={step.id === firstTodo?.id} />
          ))}
        </ol>
      </Card>
      {joinLinks}
    </section>
  );
}
