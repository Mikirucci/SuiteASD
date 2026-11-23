"use client";

import { Ban, History, RotateCcw, ShieldCheck, Trash2, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { Button, Chip, ConfirmDialog, DataList, EmptyState, LoadMore, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { describeRoles } from "@/features/shell/role-labels";
import { usePermission } from "@/hooks/use-permission";
import { describeError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAccounts, useDeactivateAccount, useReactivateAccount, useRemoveAccount, type Account } from "./api";
import { AuditDialog } from "./audit-dialog";
import { RolesDialog } from "./roles-dialog";

type Pending = { action: "deactivate" | "reactivate" | "remove"; account: Account };

const CONFIRMATIONS: Record<Pending["action"], { title: string; confirmLabel: string; tone: "danger" | "primary"; describe: (name: string) => string }> = {
  deactivate: {
    title: "Disattivare l'account?",
    confirmLabel: "Disattiva",
    tone: "danger",
    describe: (name) => `${name} non potrà più accedere a questa società e uscirà subito da tutti i dispositivi. Tesserato, pagamenti e storico restano. Puoi riattivarlo quando vuoi.`,
  },
  reactivate: {
    title: "Riattivare l'account?",
    confirmLabel: "Riattiva",
    tone: "primary",
    describe: (name) => `${name} potrà accedere di nuovo a questa società con i ruoli che aveva.`,
  },
  remove: {
    title: "Togliere la persona dalla società?",
    confirmLabel: "Rimuovi",
    tone: "danger",
    describe: (name) => `${name} perde l'accesso e non compare più in questo elenco. Il tesserato, i pagamenti e lo storico restano: non si cancella nulla di personale.`,
  },
};

function AccountRow({
  account,
  isSelf,
  canWrite,
  canAudit,
  onRoles,
  onAudit,
  onAsk,
}: {
  account: Account;
  isSelf: boolean;
  canWrite: boolean;
  canAudit: boolean;
  onRoles: (account: Account) => void;
  onAudit: (account: Account) => void;
  onAsk: (pending: Pending) => void;
}) {
  const name = `${account.firstName} ${account.lastName}`;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold text-fg">
            {name}
            {isSelf ? <span className="ml-2 text-xs font-semibold text-fg-muted">(sei tu)</span> : null}
          </p>
          <p className="break-all text-sm text-fg-muted">{account.email}</p>
          <p className="text-sm text-fg-muted">
            {describeRoles(account.roles)} · {account.lastLoginAt ? `Ultimo accesso il ${formatDateTime(account.lastLoginAt)}` : "Non ha ancora fatto accesso"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {!account.isActive ? <Chip tone="danger">Disattivato</Chip> : null}
          {account.emailVerified === false ? <Chip tone="warning">Email non verificata</Chip> : null}
        </div>
      </div>
      {canWrite || canAudit ? (
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button variant="secondary" size="sm" leftIcon={<ShieldCheck />} aria-label={`Cambia i ruoli di ${name}`} onClick={() => onRoles(account)}>
              Ruoli
            </Button>
          ) : null}
          {canWrite && !isSelf && account.isActive ? (
            <Button variant="ghost" size="sm" leftIcon={<Ban />} aria-label={`Disattiva l'account di ${name}`} onClick={() => onAsk({ action: "deactivate", account })}>
              Disattiva
            </Button>
          ) : null}
          {canWrite && !account.isActive ? (
            <Button variant="ghost" size="sm" leftIcon={<RotateCcw />} aria-label={`Riattiva l'account di ${name}`} onClick={() => onAsk({ action: "reactivate", account })}>
              Riattiva
            </Button>
          ) : null}
          {canWrite && !isSelf ? (
            <Button variant="ghost" size="sm" leftIcon={<Trash2 />} aria-label={`Rimuovi ${name} dalla società`} onClick={() => onAsk({ action: "remove", account })}>
              Rimuovi
            </Button>
          ) : null}
          {canAudit ? (
            <Button variant="ghost" size="sm" leftIcon={<History />} aria-label={`Storia delle modifiche di ${name}`} onClick={() => onAudit(account)}>
              Storia
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The people who can sign in to the society, with their roles. Whoever reads the list sees it; changing roles,
 * disabling and removing an account is for the administrator, who also reads the history of every change.
 */
export function PeopleSection() {
  const { me } = useAuth();
  const { toast } = useToast();
  const canRead = usePermission("users:read");
  const canWrite = usePermission("users:write");
  const canAudit = usePermission("users:auditRead");
  const list = useAccounts(canRead);
  const deactivate = useDeactivateAccount();
  const reactivate = useReactivateAccount();
  const remove = useRemoveAccount();
  const [rolesOf, setRolesOf] = useState<Account | null>(null);
  const [auditOf, setAuditOf] = useState<Account | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!canRead) return null;

  function ask(next: Pending) {
    setActionError(null);
    setPending(next);
  }

  async function confirm() {
    if (!pending) return;
    const { action, account } = pending;
    try {
      if (action === "deactivate") await deactivate.mutateAsync(account.id);
      if (action === "reactivate") await reactivate.mutateAsync(account.id);
      if (action === "remove") await remove.mutateAsync(account.id);
      toast({
        title: action === "deactivate" ? "Account disattivato" : action === "reactivate" ? "Account riattivato" : "Persona tolta dalla società",
        description: `${account.firstName} ${account.lastName}`,
        tone: "success",
      });
      setPending(null);
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  const copy = pending ? CONFIRMATIONS[pending.action] : null;

  return (
    <section aria-labelledby="people-title" className="flex flex-col gap-4">
      <div>
        <h2 id="people-title" className="text-lg font-bold tracking-title text-fg">
          Persone con accesso
        </h2>
        <p className="text-sm text-fg-muted">Chi può entrare oggi nella società e con quale ruolo.</p>
      </div>
      <DataList
        label="Persone con accesso"
        items={list.items}
        getKey={(account) => account.id}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        loadingLabel="Caricamento delle persone"
        skeletonRows={3}
        empty={<EmptyState icon={UserRoundCheck} title="Nessuna persona" description="Quando qualcuno accetta un invito compare qui." />}
        renderItem={(account) => (
          <AccountRow
            account={account}
            isSelf={account.email.toLowerCase() === me?.user.email.toLowerCase()}
            canWrite={canWrite}
            canAudit={canAudit}
            onRoles={setRolesOf}
            onAudit={setAuditOf}
            onAsk={ask}
          />
        )}
      />
      <LoadMore list={list} noun="Persone" moreLabel="Carica altre persone" />

      {rolesOf ? <RolesDialog key={rolesOf.id} account={rolesOf} onClose={() => setRolesOf(null)} /> : null}
      {auditOf ? <AuditDialog key={auditOf.id} account={auditOf} onClose={() => setAuditOf(null)} /> : null}
      {pending && copy ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={copy.title}
          description={copy.describe(`${pending.account.firstName} ${pending.account.lastName}`)}
          confirmLabel={copy.confirmLabel}
          tone={copy.tone}
          loading={deactivate.isPending || reactivate.isPending || remove.isPending}
          error={actionError}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </section>
  );
}
