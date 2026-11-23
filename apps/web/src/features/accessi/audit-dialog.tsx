"use client";

import { History } from "lucide-react";
import { Button, DataList, Dialog, DialogClose, DialogContent, EmptyState, LoadMore } from "@/components/ui";
import { describeRoles } from "@/features/shell/role-labels";
import { formatDateTime } from "@/lib/format";
import { useAccountAudit, type Account, type AuditAction, type AuditEntry } from "./api";

const ACTION_LABELS: Record<AuditAction, string> = {
  ROLES_CHANGED: "Ruoli cambiati",
  DEACTIVATED: "Account disattivato",
  REACTIVATED: "Account riattivato",
  REMOVED: "Rimosso dalla società",
};

function detailOf(entry: AuditEntry): string | null {
  if (entry.action !== "ROLES_CHANGED") return null;
  return `${describeRoles(entry.rolesBefore) || "Nessun ruolo"} → ${describeRoles(entry.rolesAfter) || "Nessun ruolo"}`;
}

interface AuditDialogProps {
  account: Account;
  onClose: () => void;
}

/** Who changed what on the account and when, newest first. Only the administrators can read it. */
export function AuditDialog({ account, onClose }: AuditDialogProps) {
  const history = useAccountAudit(account.id, true);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Storia delle modifiche"
        description={`${account.firstName} ${account.lastName} · ${account.email}`}
        scrollable
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Chiudi</Button>
          </DialogClose>
        }
      >
        <div className="flex flex-col gap-3">
          <DataList
            label="Modifiche all'account"
            items={history.items}
            getKey={(entry) => entry.id}
            isLoading={history.isLoading}
            error={history.error}
            onRetry={history.refetch}
            loadingLabel="Caricamento della storia"
            skeletonRows={3}
            empty={<EmptyState icon={History} title="Nessuna modifica" description="Da quando esiste l'account nessuno ne ha cambiato ruoli o stato." />}
            renderItem={(entry) => (
              <div className="flex flex-col gap-0.5 p-4">
                <p className="text-sm font-bold text-fg">{ACTION_LABELS[entry.action]}</p>
                {detailOf(entry) ? <p className="text-sm text-fg">{detailOf(entry)}</p> : null}
                <p className="text-xs text-fg-muted">
                  {formatDateTime(entry.createdAt)} · {entry.actorName ?? "un account che non esiste più"}
                </p>
              </div>
            )}
          />
          <LoadMore list={history} noun="Modifiche" moreLabel="Carica altre modifiche" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
