"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { useState } from "react";
import { DataBoundary, EmptyState, Switch, useToast } from "@/components/ui";
import { describeError, useApiMutation } from "@/lib/api";
import { CHANNEL_LABELS, CHANNELS, TYPE_INFO } from "./catalog";
import { offeredTypes, PREFERENCES_KEY, useNotificationPreferences } from "./preferences-query";
import type { NotificationChannel, NotificationPreference, NotificationType, PreferencesResponse } from "./types";

function keyOf(type: NotificationType, channel: NotificationChannel): string {
  return `${type}:${channel}`;
}

/** Per type and channel switches of the signed-in user. Every change is saved at once. */
export function PreferencesPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const preferences = useNotificationPreferences();
  // Value shown while a change is being saved, so the switch answers at once; dropped when the request settles
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const settle = (change: NotificationPreference) =>
    setPending((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== keyOf(change.type, change.channel))));

  const save = useApiMutation(
    (change: NotificationPreference, client) =>
      client.put<PreferencesResponse>("/notifications/preferences", { preferences: [change] }),
    {
      onSuccess: async (_saved, change) => {
        await queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
        settle(change);
      },
      onError: (error, change) => {
        settle(change);
        toast({ title: "Preferenza non salvata", description: describeError(error), tone: "danger" });
      },
    },
  );

  const stored = new Map((preferences.data?.preferences ?? []).map((item) => [keyOf(item.type, item.channel), item.enabled]));
  // The API lists every pair; a missing one counts as enabled, like the server does
  const isEnabled = (type: NotificationType, channel: NotificationChannel) =>
    pending[keyOf(type, channel)] ?? stored.get(keyOf(type, channel)) ?? true;

  const change = (type: NotificationType, channel: NotificationChannel, enabled: boolean) => {
    setPending((current) => ({ ...current, [keyOf(type, channel)]: enabled }));
    save.mutate({ type, channel, enabled });
  };

  return (
    <section aria-labelledby="preferenze-titolo" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="preferenze-titolo" className="text-lg font-bold tracking-title text-fg">
          Dove ricevere gli avvisi
        </h2>
        <p className="max-w-prose text-sm text-fg-muted">
          Scegli per ogni tipo di avviso se vederlo nell&apos;app, riceverlo per email o entrambi. Le modifiche si salvano subito.
        </p>
      </div>
      <DataBoundary
        isLoading={preferences.isLoading}
        error={preferences.error}
        onRetry={() => void preferences.refetch()}
        isEmpty={preferences.data?.preferences.length === 0}
        loadingLabel="Caricamento delle preferenze"
        empty={
          <EmptyState
            icon={BellOff}
            title="Nessuna preferenza da mostrare"
            description="Quando la società attiverà gli avvisi potrai scegliere qui come riceverli."
          />
        }
      >
        <ul aria-label="Preferenze per tipo di avviso" className="divide-y divide-line rounded-lg bg-surface shadow-soft">
          {offeredTypes(preferences.data).map((type) => {
            const info = TYPE_INFO[type];
            return (
              <li key={type} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fg">{info.label}</p>
                  <p className="text-sm text-fg-muted">{info.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-x-6">
                  {CHANNELS.map((channel) => (
                    <Switch
                      key={channel}
                      label={
                        <>
                          {CHANNEL_LABELS[channel]}{" "}
                          <span className="sr-only">per {info.label}</span>
                        </>
                      }
                      checked={isEnabled(type, channel)}
                      onChange={(event) => change(type, channel, event.target.checked)}
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </DataBoundary>
    </section>
  );
}
