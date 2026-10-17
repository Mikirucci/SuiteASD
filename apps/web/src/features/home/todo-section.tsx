"use client";

import { Check, ChevronRight, type LucideIcon, CalendarCheck, CalendarClock, UserPlus, Wallet } from "lucide-react";
import Link from "next/link";
import { Card, Skeleton } from "@/components/ui";
import { formatDayTitle, formatTime } from "@/features/calendario/format";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { BlockError } from "./block-states";
import { useFeesSummary, useMembersSummary, useNewEnrolments, useNextMatch, type HomeAccess } from "./home-queries";

type TodoTone = "danger" | "warning" | "brand";

interface TodoItem {
  id: string;
  tone: TodoTone;
  icon: LucideIcon;
  /** Text of the count tile: "3", or "100+" when the list was cut. */
  count: string;
  label: string;
  detail: string;
  href: string;
}

type TodoSlot =
  | { id: string; status: "loading" }
  | { id: string; status: "error"; what: string; retry: () => void }
  | { id: string; status: "clear"; allClear: string }
  | { id: string; status: "item"; item: TodoItem };

const TONE_CLASSES: Record<TodoTone, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  brand: "bg-primary-soft text-brand-700",
};

/**
 * One slot per check the user may see. Each check has its own query, so a failing one shows its own error
 * and the others still tell what needs doing.
 */
function useTodoSlots(access: HomeAccess): TodoSlot[] {
  const enrolments = useNewEnrolments(access.enrolments);
  const members = useMembersSummary(access.members && access.documents);
  const fees = useFeesSummary(access.payments);
  const nextMatch = useNextMatch(access.events && access.convocations);
  const slots: TodoSlot[] = [];

  if (access.enrolments) {
    const unread = enrolments.data?.data ?? [];
    const latest = unread[0];
    if (enrolments.isLoading) slots.push({ id: "enrolments", status: "loading" });
    else if (enrolments.error) slots.push({ id: "enrolments", status: "error", what: "le nuove iscrizioni", retry: () => void enrolments.refetch() });
    else if (!latest) slots.push({ id: "enrolments", status: "clear", allClear: "nessuna nuova iscrizione da leggere" });
    else {
      const more = enrolments.data?.page.hasMore ? "+" : "";
      slots.push({
        id: "enrolments",
        status: "item",
        item: {
          id: "enrolments",
          tone: "brand",
          icon: UserPlus,
          count: `${unread.length}${more}`,
          label: unread.length === 1 && !more ? "Nuova iscrizione da leggere" : "Nuove iscrizioni da leggere",
          detail: unread.length === 1 ? latest.body : `L'ultima: ${latest.body}`,
          href: "/notifiche",
        },
      });
    }
  }

  if (access.members && access.documents) {
    const missing = members.data?.documentiMancanti ?? 0;
    if (members.isLoading) slots.push({ id: "documents", status: "loading" });
    else if (members.error) slots.push({ id: "documents", status: "error", what: "i documenti dei tesserati", retry: () => void members.refetch() });
    else if (missing === 0) slots.push({ id: "documents", status: "clear", allClear: "nessun documento mancante o scaduto" });
    else {
      slots.push({
        id: "documents",
        status: "item",
        item: {
          id: "documents",
          tone: "danger",
          icon: CalendarClock,
          count: String(missing),
          label: missing === 1 ? "Documento mancante o scaduto" : "Documenti mancanti o scaduti",
          detail: "Vedi chi deve ancora consegnarli o rinnovarli.",
          href: "/scadenze",
        },
      });
    }
  }

  if (access.payments) {
    const overdue = fees.data?.overdueCount ?? 0;
    if (fees.isLoading) slots.push({ id: "fees", status: "loading" });
    else if (fees.error) slots.push({ id: "fees", status: "error", what: "le quote", retry: () => void fees.refetch() });
    else if (overdue === 0) slots.push({ id: "fees", status: "clear", allClear: "nessuna quota scaduta" });
    else {
      slots.push({
        id: "fees",
        status: "item",
        item: {
          id: "fees",
          tone: "danger",
          icon: Wallet,
          count: String(overdue),
          label: overdue === 1 ? "Quota scaduta" : "Quote scadute",
          detail: `Valgono ${formatEuro(fees.data?.scadutoCents ?? 0)} in tutto.`,
          href: "/quote",
        },
      });
    }
  }

  if (access.events && access.convocations) {
    const match = nextMatch.data?.data[0];
    const pending = match?.convocations.pending ?? 0;
    if (nextMatch.isLoading) slots.push({ id: "convocations", status: "loading" });
    else if (nextMatch.error) slots.push({ id: "convocations", status: "error", what: "le convocazioni", retry: () => void nextMatch.refetch() });
    else if (!match || pending === 0) slots.push({ id: "convocations", status: "clear", allClear: "nessuna convocazione senza risposta" });
    else {
      const when = new Date(match.startsAt);
      slots.push({
        id: "convocations",
        status: "item",
        item: {
          id: "convocations",
          tone: "warning",
          icon: CalendarCheck,
          count: String(pending),
          label: pending === 1 ? "Convocato senza risposta" : "Convocati senza risposta",
          detail: `Prossima partita: ${match.title}, ${formatDayTitle(when)} alle ${formatTime(match.startsAt)}.`,
          href: "/calendario",
        },
      });
    }
  }

  return slots;
}

function TodoRow({ item }: { item: TodoItem }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className="group flex min-h-16 items-center gap-4 rounded-md px-3 py-3 transition-colors duration-150 hover:bg-surface-muted"
      >
        <span
          className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-md text-lg font-extrabold tabular-nums", TONE_CLASSES[item.tone])}
        >
          {item.count}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-base font-bold text-fg">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
            {item.label}
          </span>
          <span className="break-words text-sm text-fg-muted">{item.detail}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-subtle transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

function TodoSkeletonRow() {
  return (
    <li className="flex min-h-16 items-center gap-4 px-3 py-3">
      <Skeleton className="size-12 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </li>
  );
}

/** Level 1 of the home: what needs the administrator's attention right now, each line leading to the right page. */
export function TodoSection({ access }: { access: HomeAccess }) {
  const slots = useTodoSlots(access);
  if (slots.length === 0) return null;

  const items = slots.flatMap((slot) => (slot.status === "item" ? [slot.item] : []));
  const loading = slots.filter((slot) => slot.status === "loading");
  const errors = slots.flatMap((slot) => (slot.status === "error" ? [slot] : []));
  const clear = slots.flatMap((slot) => (slot.status === "clear" ? [slot.allClear] : []));
  const settled = loading.length === 0 && errors.length === 0 && items.length === 0;

  return (
    <section aria-labelledby="home-todo" className="flex flex-col gap-4">
      <h2 id="home-todo" className="text-lg font-extrabold tracking-title text-fg">
        Da fare adesso
      </h2>
      <Card padding="sm">
        {settled ? (
          <div className="flex items-start gap-4 px-3 py-3">
            <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
              <Check className="size-6" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-base font-bold text-fg">Tutto in ordine</p>
              <p className="text-sm text-fg-muted">{`${clear.join(", ").replace(/^./, (letter) => letter.toLocaleUpperCase("it-IT"))}.`}</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <TodoRow key={item.id} item={item} />
            ))}
            {loading.map((slot) => (
              <TodoSkeletonRow key={slot.id} />
            ))}
            {errors.map((slot) => (
              <li key={slot.id} className="px-3 py-3">
                <BlockError what={slot.what} onRetry={slot.retry} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {loading.length > 0 ? <p className="sr-only" role="status">Controllo cosa c&apos;è da fare</p> : null}
    </section>
  );
}
