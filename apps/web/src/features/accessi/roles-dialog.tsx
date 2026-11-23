"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Dialog, DialogClose, DialogContent, useToast } from "@/components/ui";
import { ROLE_LABELS } from "@/features/shell/role-labels";
import { describeError, ROLES, type Role } from "@/lib/api";
import { useChangeRoles, type Account } from "./api";

const ROLE_HINTS: Record<Role, string> = {
  ADMIN: "Può fare tutto, compresi bilancio, sponsor, automazioni e gli accessi.",
  SEGRETERIA: "Gestisce tesserati, quote, documenti e inviti.",
  ALLENATORE: "Vede i tesserati, convoca, segna le presenze e scrive le pagelle.",
  STAFF: "Vede tesserati e documenti; gestisce palestre, trasferte e divise.",
  ATLETA: "Ha la sua area personale: dati, documenti, pagamenti e convocazioni.",
  GENITORE: "Ha l'area personale dei figli: dati, documenti, pagamenti e convocazioni.",
};

interface RolesDialogProps {
  account: Account;
  onClose: () => void;
}

/**
 * Picks the roles of a person: the ones chosen replace the ones they have. The server keeps the rules (at least one
 * active administrator, only an administrator touches the administrators): its refusal is shown in the dialog.
 */
export function RolesDialog({ account, onClose }: RolesDialogProps) {
  const { toast } = useToast();
  const change = useChangeRoles(account.id);
  const [chosen, setChosen] = useState<ReadonlySet<Role>>(new Set(account.roles));
  const unchanged = chosen.size === account.roles.length && account.roles.every((role) => chosen.has(role));

  function toggle(role: Role, on: boolean) {
    const next = new Set(chosen);
    if (on) next.add(role);
    else next.delete(role);
    setChosen(next);
  }

  function save() {
    change.mutate(
      ROLES.filter((role) => chosen.has(role)),
      {
        onSuccess: () => {
          toast({ title: "Ruoli aggiornati", description: `${account.firstName} ${account.lastName}`, tone: "success" });
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Cambia i ruoli"
        description={`${account.firstName} ${account.lastName} · ${account.email}. I nuovi permessi valgono al prossimo rinnovo della sessione, al massimo entro 15 minuti.`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button loading={change.isPending} disabled={unchanged || chosen.size === 0} onClick={save}>
              Salva i ruoli
            </Button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Ruoli</legend>
          {change.error ? <Alert tone="danger">{describeError(change.error)}</Alert> : null}
          {ROLES.map((role) => (
            <Checkbox
              key={role}
              label={ROLE_LABELS[role]}
              hint={ROLE_HINTS[role]}
              checked={chosen.has(role)}
              onChange={(event) => toggle(role, event.target.checked)}
            />
          ))}
          {chosen.size === 0 ? <p className="text-sm text-fg-muted">Scegli almeno un ruolo. Per togliere una persona dalla società usa «Rimuovi».</p> : null}
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
