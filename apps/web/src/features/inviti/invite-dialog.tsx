"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, useToast } from "@/components/ui";
import { applyServerErrors } from "@/features/tesserati/server-errors";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useCreateInvitation } from "./api";
import {
  ROLE_HINT,
  ROLE_LABEL,
  COLLABORATOR_ROLES,
  invitationLink,
  type CollaboratorRole,
  type CreatedInvitation,
} from "./invitation-format";

const FORM_ID = "invite-form";

const inviteSchema = z.object({
  label: z.string().trim().max(80, "Massimo 80 caratteri"),
  role: z.enum(COLLABORATOR_ROLES),
});

type InviteValues = z.infer<typeof inviteSchema>;

interface InviteFormProps {
  roles: readonly CollaboratorRole[];
  onCreated: (invitation: CreatedInvitation) => void;
  onBusyChange: (busy: boolean) => void;
}

function InviteForm({ roles, onCreated, onBusyChange }: InviteFormProps) {
  const create = useCreateInvitation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    // The role with the fewest powers is the safe default
    defaultValues: { label: "", role: roles.includes("ALLENATORE") ? "ALLENATORE" : (roles[0] ?? "ALLENATORE") },
  });
  const role = useWatch({ control, name: "role" });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    onBusyChange(true);
    try {
      onCreated(await create.mutateAsync({ role: values.role, ...(values.label ? { label: values.label } : {}) }));
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 403
          ? "Non puoi invitare una persona con questo ruolo."
          : applyServerErrors(error, setError, ["label", "role"]),
      );
    } finally {
      onBusyChange(false);
    }
  });

  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate aria-label="Nuovo invito" className="flex flex-col gap-4 p-1">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Select
        label="Ruolo"
        required
        options={roles.map((value) => ({ value, label: ROLE_LABEL[value] }))}
        hint={ROLE_HINT[role]}
        error={errors.role?.message}
        {...register("role")}
      />
      <Input
        label="Per chi è"
        maxLength={80}
        autoComplete="off"
        placeholder="Ad esempio Marco, nuovo allenatore U14"
        hint="Facoltativo: serve a te per riconoscere l'invito nell'elenco."
        error={errors.label?.message}
        {...register("label")}
      />
    </form>
  );
}

function InviteResult({ invitation }: { invitation: CreatedInvitation }) {
  const { toast } = useToast();
  const link = invitationLink(window.location.origin, invitation.token);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copiato", description: "Incollalo in un messaggio.", tone: "success" });
    } catch {
      toast({ title: "Non sono riuscito a copiarlo", description: "Selezionalo e copialo a mano.", tone: "danger" });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      <Alert tone="success" title="Link pronto">
        {invitation.label ? `${invitation.label}: ` : ""}entrerà come {ROLE_LABEL[invitation.role].toLowerCase()}.
      </Alert>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-fg">Il link da mandare</p>
        <p className="break-all rounded-md bg-surface-muted px-3 py-2 text-xs text-fg-muted">{link}</p>
        <div>
          <Button variant="secondary" size="sm" leftIcon={<Copy />} onClick={() => void copy()}>
            Copia il link
          </Button>
        </div>
      </div>
      <Alert tone="info">
        Per ora l&apos;app non invia email: copia il link e mandalo tu, per esempio su WhatsApp. Chi lo apre scrive nome,
        email e password ed entra. Il link vale fino al {formatDateTime(invitation.expiresAt)} e si vede solo adesso; se
        lo perdi, revoca l&apos;invito e creane uno nuovo.
      </Alert>
    </div>
  );
}

export interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Roles the signed-in user may grant. */
  roles: readonly CollaboratorRole[];
}

/** Invite a person with a role; after the creation the same dialog shows the one-time link to copy. */
export function InviteDialog({ open, onOpenChange, roles }: InviteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={created ? "Link pronto" : "Invita una persona"}
        description={
          created
            ? undefined
            : "Crei un link per un ruolo e lo mandi tu. Chi lo apre sceglie nome, email e password; tu decidi cosa potrà vedere e fare."
        }
        footer={
          created ? (
            <DialogClose asChild>
              <Button>Fatto</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="secondary">Annulla</Button>
              </DialogClose>
              <Button type="submit" form={FORM_ID} loading={busy}>
                Crea il link
              </Button>
            </>
          )
        }
      >
        {created ? (
          <InviteResult invitation={created} />
        ) : (
          <InviteForm roles={roles} onCreated={setCreated} onBusyChange={setBusy} />
        )}
      </DialogContent>
    </Dialog>
  );
}
