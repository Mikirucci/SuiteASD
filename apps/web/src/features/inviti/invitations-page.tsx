"use client";

import { Ban, Lock, MailPlus, RefreshCw, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button, Chip, ConfirmDialog, DataList, Dialog, DialogClose, DialogContent, EmptyState, LoadMore, SectionHeading, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { PeopleSection } from "@/features/accessi/people-section";
import { usePermission } from "@/hooks/use-permission";
import { ApiError, describeError } from "@/lib/api";
import { usePendingInvitations, useResendInvitation, useRevokeInvitation } from "./api";
import { InviteDialog, InviteResult } from "./invite-dialog";
import { ROLE_LABEL, describeInvitationExpiry, invitableRoles, invitationTitle, type CreatedInvitation, type Invitation } from "./invitation-format";

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
  onResend?: () => void;
  resending?: boolean;
}

function InvitationRow({ invitation, now, onRevoke, onResend, resending }: InvitationRowProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold text-fg">{invitationTitle(invitation)}</p>
          <p className="break-words text-sm text-fg-muted">
            {ROLE_LABEL[invitation.role]} · {describeInvitationExpiry(invitation.expiresAt, now)}
          </p>
        </div>
        <Chip tone="brand">In attesa</Chip>
      </div>
      {onRevoke || onResend ? (
        <div className="flex flex-wrap gap-2">
          {onResend ? (
            <Button
              variant="ghost"
              leftIcon={<RefreshCw />}
              loading={resending}
              aria-label={`Reinvia l'invito: ${invitationTitle(invitation)}`}
              onClick={onResend}
            >
              Reinvia
            </Button>
          ) : null}
          {onRevoke ? (
            <Button variant="ghost" leftIcon={<Ban />} aria-label={`Revoca l'invito: ${invitationTitle(invitation)}`} onClick={onRevoke}>
              Revoca
            </Button>
          ) : null}
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
  const resend = useResendInvitation();
  const [resent, setResent] = useState<CreatedInvitation | null>(null);

  function resendInvitation(invitation: Invitation) {
    resend.mutate(invitation.id, {
      onSuccess: (created) => setResent(created),
      onError: (error) => toast({ title: "Non sono riuscito a reinviarlo", description: describeError(error), tone: "danger" }),
    });
  }
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
        toast({ title: "Invito revocato", description: invitationTitle(revoking), tone: "success" });
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
      description="Crea un link per allenatori, segreteria e staff e mandalo tu: ognuno vede solo ciò che il suo ruolo permette. Atleti e genitori si iscrivono dal link d'iscrizione, nella pagina Tesserati."
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
            onResend={canWrite ? () => resendInvitation(invitation) : undefined}
            resending={resend.isPending && resend.variables === invitation.id}
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
                ? "Crea il primo link: chi lo apre sceglie nome, email e password ed entra con il ruolo che hai scelto."
                : "Quando qualcuno viene invitato, l'invito compare qui finché non lo accetta."
            }
            action={inviteButton}
          />
        }
      />
      <LoadMore list={list} noun="Inviti" moreLabel="Carica altri inviti" />
      <p className="max-w-prose text-sm text-fg-muted">
        Qui vedi i link ancora da usare. Quando qualcuno completa la registrazione il link esce dall&apos;elenco, la
        persona compare in Staff e ricevi un avviso nelle notifiche. Un link scaduto o revocato esce anch&apos;esso.
      </p>

      <PeopleSection />

      {resent ? (
        <Dialog open onOpenChange={(open) => !open && setResent(null)}>
          <DialogContent
            title="Nuovo link pronto"
            description="Il link di prima non funziona più."
            footer={
              <DialogClose asChild>
                <Button>Fatto</Button>
              </DialogClose>
            }
          >
            <InviteResult invitation={resent} />
          </DialogContent>
        </Dialog>
      ) : null}

      {canWrite && roles.length > 0 ? (
        <InviteDialog key={openings} open={inviteOpen} onOpenChange={setInviteOpen} roles={roles} />
      ) : null}
      {canWrite ? (
        <ConfirmDialog
          open={revoking !== null}
          onOpenChange={(open) => !open && setRevoking(null)}
          title="Revocare l'invito?"
          description={revoking ? `Il link «${invitationTitle(revoking)}» smette di funzionare subito.` : ""}
          confirmLabel="Revoca"
          loading={revoke.isPending}
          error={revoke.error ? describeRevokeError(revoke.error) : null}
          onConfirm={confirmRevoke}
        />
      ) : null}
    </div>
  );
}
