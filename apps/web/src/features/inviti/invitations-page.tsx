"use client";

import { Ban, Lock, MailPlus, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button, Chip, ConfirmDialog, DataList, EmptyState, LoadMore, SectionHeading, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { usePermission } from "@/hooks/use-permission";
import { ApiError, describeError } from "@/lib/api";
import { usePendingInvitations, useRevokeInvitation } from "./api";
import { InviteDialog } from "./invite-dialog";
import { ROLE_LABEL, describeInvitationExpiry, invitableRoles, type Invitation } from "./invitation-format";

function describeRevokeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "L'invito non è più in attesa: è stato accettato o è già stato revocato. Chiudi questa finestra, l'elenco si aggiorna da solo.";
  }
  return describeError(error);
}

interface InvitationRowProps {
  invitation: Invitation;
  now: Date;
  onRevoke?: () => void;
}

function InvitationRow({ invitation, now, onRevoke }: InvitationRowProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-bold text-fg">{invitation.email}</p>
          <p className="break-words text-sm text-fg-muted">
            {ROLE_LABEL[invitation.role]} · {describeInvitationExpiry(invitation.expiresAt, now)}
          </p>
        </div>
        <Chip tone="brand">In attesa</Chip>
      </div>
      {onRevoke ? (
        <div>
          <Button variant="ghost" leftIcon={<Ban />} aria-label={`Revoca l'invito a ${invitation.email}`} onClick={onRevoke}>
            Revoca
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Who can enter the society with which role: invite a collaborator and follow the invitations still open. */
export function InvitationsPage() {
  const { me } = useAuth();
  const { toast } = useToast();
  const canRead = usePermission("invitations:read");
  const canWrite = usePermission("invitations:write");
  const list = usePendingInvitations(canRead);
  const revoke = useRevokeInvitation();
  const [inviteOpen, setInviteOpen] = useState(false);
  // A new dialog instance per opening, so that the one-time link of the previous invitation is never shown again
  const [openings, setOpenings] = useState(0);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const roles = invitableRoles(me?.roles ?? []);

  function openInvite() {
    setOpenings((count) => count + 1);
    setInviteOpen(true);
  }

  function confirmRevoke() {
    if (!revoking) return;
    revoke.mutate(revoking.id, {
      onSuccess: () => {
        toast({ title: "Invito revocato", description: revoking.email, tone: "success" });
        setRevoking(null);
      },
    });
  }

  const heading = (
    <SectionHeading
      as="h1"
      label="Accessi e inviti"
      title="Chi può entrare nella società."
      highlight="Chi può entrare"
      description="Invita allenatori, segreteria e staff: ognuno vede solo ciò che il suo ruolo permette. Atleti e genitori si iscrivono dal link d'iscrizione, nella pagina Tesserati."
    />
  );

  if (!canRead) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <EmptyState
          icon={Lock}
          title="Non hai accesso a questa sezione"
          description="Gli inviti li gestiscono l'amministratore e la segreteria."
        />
      </div>
    );
  }

  const inviteButton =
    canWrite && roles.length > 0 ? (
      <Button leftIcon={<UserPlus />} onClick={openInvite}>
        Invita una persona
      </Button>
    ) : undefined;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      {heading}

      {list.items && list.items.length > 0 ? <div>{inviteButton}</div> : null}

      <DataList
        label="Inviti in attesa"
        items={list.items}
        getKey={(invitation) => invitation.id}
        renderItem={(invitation) => (
          <InvitationRow
            invitation={invitation}
            now={now}
            onRevoke={
              canWrite
                ? () => {
                    revoke.reset();
                    setRevoking(invitation);
                  }
                : undefined
            }
          />
        )}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        loadingLabel="Caricamento degli inviti"
        skeletonRows={3}
        empty={
          <EmptyState
            icon={MailPlus}
            title="Nessun invito in attesa"
            description={
              inviteButton
                ? "Invita il primo collaboratore: riceverà un link per scegliere la password ed entrare."
                : "Quando qualcuno viene invitato, l'invito compare qui finché non lo accetta."
            }
            action={inviteButton}
          />
        }
      />
      <LoadMore list={list} noun="Inviti" moreLabel="Carica altri inviti" />
      <p className="max-w-prose text-sm text-fg-muted">
        Qui vedi gli inviti ancora aperti: quando qualcuno accetta, scade o viene revocato, l&apos;invito esce
        dall&apos;elenco.
      </p>

      {canWrite && roles.length > 0 ? (
        <InviteDialog key={openings} open={inviteOpen} onOpenChange={setInviteOpen} roles={roles} />
      ) : null}
      {canWrite ? (
        <ConfirmDialog
          open={revoking !== null}
          onOpenChange={(open) => !open && setRevoking(null)}
          title="Revocare l'invito?"
          description={revoking ? `Il link mandato a ${revoking.email} smette di funzionare subito.` : ""}
          confirmLabel="Revoca"
          loading={revoke.isPending}
          error={revoke.error ? describeRevokeError(revoke.error) : null}
          onConfirm={confirmRevoke}
        />
      ) : null}
    </div>
  );
}
