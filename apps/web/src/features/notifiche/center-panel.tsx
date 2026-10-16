"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BellOff, CheckCheck, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button, DataList, EmptyState, LoadMore, PillFilter, type PillOption, Select, useToast } from "@/components/ui";
import { NOTIFICATIONS_KEY, useUnreadCount } from "@/hooks/use-unread-count";
import { describeError, useApiMutation } from "@/lib/api";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { TYPE_INFO } from "./catalog";
import { pluralize } from "./format";
import { NotificationRow } from "./notification-row";
import { offeredTypes, useNotificationPreferences } from "./preferences-query";
import type { AppNotification, ReadAllResult } from "./types";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: readonly PillOption[] = [
  { value: "all", label: "Tutte" },
  { value: "unread", label: "Non lette" },
];

function summaryOf(unread: number): string {
  if (unread === 0) return "Sei in pari: nessuna notifica da leggere.";
  return `${unread} ${pluralize(unread, "notifica da leggere", "notifiche da leggere")}`;
}

/** In-app notification center of the signed-in user: list with read state, filters, mark as read. */
export function CenterPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("");
  // A row that was just marked read loses its button: focus moves here so keyboard users do not lose their place
  const summaryRef = useRef<HTMLParagraphElement>(null);

  const unreadCount = useUnreadCount();
  // The filter only offers the types this user can receive (the administration has its own)
  const preferences = useNotificationPreferences();
  const typeOptions = useMemo(
    () => [{ value: "", label: "Tutti i tipi" }, ...offeredTypes(preferences.data).map((type) => ({ value: type, label: TYPE_INFO[type].label }))],
    [preferences.data],
  );
  const list = useCursorQuery<AppNotification>(
    [...NOTIFICATIONS_KEY, "list", { status, type }],
    "/notifications",
    { unread: status === "unread" ? true : undefined, type: type || undefined, limit: PAGE_SIZE },
  );

  const markRead = useApiMutation((id: string, client) => client.post<AppNotification>(`/notifications/${id}/read`), {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      summaryRef.current?.focus();
    },
    onError: (error) => toast({ title: "Non sono riuscito a segnarla come letta", description: describeError(error), tone: "danger" }),
  });
  const markAllRead = useApiMutation((_: void, client) => client.post<ReadAllResult>("/notifications/read-all"), {
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      toast({
        title: "Notifiche segnate come lette",
        description: `${result.updated} ${pluralize(result.updated, "notifica", "notifiche")}.`,
        tone: "success",
      });
      summaryRef.current?.focus();
    },
    onError: (error) => toast({ title: "Non sono riuscito a segnarle come lette", description: describeError(error), tone: "danger" }),
  });

  const unread = unreadCount.data?.count;
  const hasFilters = status !== "all" || type !== "";
  const resetFilters = () => {
    setStatus("all");
    setType("");
  };

  const empty = !hasFilters ? (
    <EmptyState
      icon={BellOff}
      title="Nessuna notifica"
      description="Convocazioni, scadenze e comunicazioni della società arriveranno qui appena partono."
    />
  ) : status === "unread" && type === "" ? (
    <EmptyState
      icon={CheckCheck}
      title="Hai letto tutto"
      description="Non ci sono notifiche da leggere. Le nuove compariranno qui."
      action={
        <Button variant="secondary" onClick={resetFilters}>
          Mostra tutte le notifiche
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Search}
      title="Nessuna notifica con questi filtri"
      description="Prova con un altro tipo, oppure mostra anche quelle già lette."
      action={
        <Button variant="secondary" onClick={resetFilters}>
          Azzera i filtri
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {unread === undefined ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p ref={summaryRef} tabIndex={-1} className="text-sm font-semibold text-fg outline-none">
            {summaryOf(unread)}
          </p>
          {unread > 0 ? (
            <Button
              variant="secondary"
              leftIcon={<CheckCheck />}
              loading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Segna tutte come lette
            </Button>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <PillFilter label="Filtra per stato" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <Select
          label="Tipo di notifica"
          options={typeOptions}
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      <section aria-label="Elenco notifiche" className="flex flex-col gap-3">
        <DataList
          label="Notifiche"
          items={list.items}
          getKey={(notification) => notification.id}
          renderItem={(notification) => (
            <NotificationRow
              notification={notification}
              onMarkRead={(target) => markRead.mutate(target.id)}
              busy={markRead.isPending && markRead.variables === notification.id}
            />
          )}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          loadingLabel="Caricamento delle notifiche"
          empty={empty}
        />
        <LoadMore list={list} noun="Notifiche" moreLabel="Mostra altre notifiche" />
      </section>
    </div>
  );
}
