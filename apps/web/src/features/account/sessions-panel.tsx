"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { Badge, Button, ConfirmDialog, DataBoundary, EmptyState } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { describeError, useApiMutation, useApiQuery } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { describeDevice } from "./device-label";

export interface DeviceSession {
  id: string;
  /** The user agent as the browser sent it, shortened; null when it did not send one. */
  device: string | null;
  createdAt: string;
  lastUsedAt: string;
  /** True for the session of the token the request was made with. */
  current: boolean;
}

const SESSIONS_KEY = ["auth", "sessions"] as const;

type Pending = { kind: "one"; session: DeviceSession } | { kind: "all" };

/**
 * The devices where the person is signed in, with the way to sign out of one or of all of them: what to do when a
 * phone is lost or somebody else used the computer. Signing out of this very device, or of all, ends the session here.
 */
export function SessionsPanel() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const sessions = useApiQuery<DeviceSession[]>(SESSIONS_KEY, "/auth/sessions");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revoke = useApiMutation((id: string, client) => client.delete<void>(`/auth/sessions/${id}`));
  const revokeAll = useApiMutation((_: void, client) => client.post<void>("/auth/logout-all"));
  const busy = revoke.isPending || revokeAll.isPending;

  async function confirm() {
    if (!pending) return;
    setError(null);
    try {
      if (pending.kind === "all") {
        await revokeAll.mutateAsync();
        await logout();
        return;
      }
      await revoke.mutateAsync(pending.session.id);
      if (pending.session.current) {
        await logout();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      setPending(null);
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  const items = sessions.data ?? [];
  const others = items.filter((session) => !session.current).length;

  return (
    <section aria-labelledby="sessions-title" className="flex flex-col gap-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="sessions-title" className="text-base font-bold tracking-title text-fg">
            Dispositivi connessi
          </h3>
          <p className="text-sm text-fg-muted">Dove hai effettuato l&apos;accesso. Se non riconosci un dispositivo, esci da lì.</p>
        </div>
        {items.length > 1 || (items.length === 1 && others > 0) ? (
          <Button variant="secondary" size="sm" leftIcon={<LogOut />} onClick={() => setPending({ kind: "all" })}>
            Esci da tutti i dispositivi
          </Button>
        ) : null}
      </div>
      <DataBoundary
        isLoading={sessions.isLoading}
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
        isEmpty={items.length === 0}
        loadingLabel="Caricamento dei dispositivi"
        skeletonRows={2}
        empty={<EmptyState icon={MonitorSmartphone} title="Nessun dispositivo" description="Non ci sono accessi attivi da mostrare." />}
      >
        <ul aria-label="Dispositivi connessi" className="flex flex-col divide-y divide-line">
          {items.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
                  {describeDevice(session.device)}
                  {session.current ? <Badge variant="success">Questo dispositivo</Badge> : null}
                </p>
                <p className="text-xs text-fg-muted">
                  Ultimo uso il {formatDateTime(session.lastUsedAt)} · accesso del {formatDateTime(session.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Esci dal dispositivo: ${describeDevice(session.device)}${session.current ? " (questo)" : ""}`}
                onClick={() => setPending({ kind: "one", session })}
              >
                Esci
              </Button>
            </li>
          ))}
        </ul>
      </DataBoundary>
      {pending ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={pending.kind === "all" ? "Uscire da tutti i dispositivi?" : "Uscire da questo dispositivo?"}
          description={
            pending.kind === "all"
              ? "Dovrai accedere di nuovo ovunque, anche qui."
              : pending.session.current
                ? "È il dispositivo che stai usando: dovrai accedere di nuovo."
                : `${describeDevice(pending.session.device)} non sarà più connesso.`
          }
          confirmLabel="Esci"
          tone="danger"
          loading={busy}
          error={error}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </section>
  );
}
