"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { useCreateMember, useUpdateMember } from "./api";
import { fullNameOf, teamLabel } from "./document-format";
import {
  EMPTY_MEMBER_FORM,
  MEMBER_FORM_FIELDS,
  formValuesOf,
  memberFormSchema,
  toCreateBody,
  toUpdateBody,
  type MemberFormValues,
} from "./member-schema";
import { applyServerErrors } from "./server-errors";
import type { MemberDetail, Team } from "./types";

const FORM_ID = "member-form";

const GENDER_OPTIONS = [
  { value: "FEMALE", label: "Femmina" },
  { value: "MALE", label: "Maschio" },
] as const;

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Attivo" },
  { value: "INACTIVE", label: "Non attivo" },
] as const;

export interface MemberFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: readonly Team[];
  /** Present when editing: the form starts from this member. */
  member?: MemberDetail;
}

interface MemberFormProps {
  teams: readonly Team[];
  member?: MemberDetail;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}

/** The form itself: mounted only while the dialog is open, so it always starts from the current data. */
function MemberForm({ teams, member, onClose, onBusyChange }: MemberFormProps) {
  const editing = Boolean(member);
  const router = useRouter();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateMember();
  const update = useUpdateMember(member?.id ?? "");
  const {
    register,
    handleSubmit,
    setError,
    control,
    setValue,
    formState: { errors },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: member ? formValuesOf(member) : EMPTY_MEMBER_FORM,
  });
  const teamIds = useWatch({ control, name: "teamIds" });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    onBusyChange(true);
    try {
      if (member) {
        await update.mutateAsync(toUpdateBody(values));
        toast({ title: "Modifiche salvate", description: fullNameOf(values), tone: "success" });
        onClose();
      } else {
        const created = await create.mutateAsync(toCreateBody(values));
        toast({ title: "Tesserato aggiunto", description: fullNameOf(created), tone: "success" });
        onClose();
        router.push(`/tesserati/${created.id}`);
      }
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, MEMBER_FORM_FIELDS, {
          fiscal_code_taken: { field: "fiscalCode", message: "Esiste già un tesserato con questo codice fiscale" },
        }),
      );
    } finally {
      onBusyChange(false);
    }
  });

  function toggleTeam(teamId: string, checked: boolean) {
    const next = checked ? [...teamIds, teamId] : teamIds.filter((id) => id !== teamId);
    setValue("teamIds", next, { shouldDirty: true });
  }

  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-6 p-1">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-xs font-bold uppercase tracking-label text-fg-muted">Anagrafica</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nome"
            required
            autoComplete="off"
            error={errors.firstName?.message}
            {...register("firstName")}
          />
          <Input
            label="Cognome"
            required
            autoComplete="off"
            error={errors.lastName?.message}
            {...register("lastName")}
          />
          <Input label="Data di nascita" type="date" error={errors.birthDate?.message} {...register("birthDate")} />
          <Input
            label="Luogo di nascita"
            autoComplete="off"
            error={errors.birthPlace?.message}
            {...register("birthPlace")}
          />
          <Select
            label="Sesso"
            options={GENDER_OPTIONS}
            placeholder="Non indicato"
            error={errors.gender?.message}
            {...register("gender")}
          />
          <Input
            label="Codice fiscale"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={16}
            error={errors.fiscalCode?.message}
            {...register("fiscalCode")}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-xs font-bold uppercase tracking-label text-fg-muted">Contatti</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Telefono"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            error={errors.phone?.message}
            {...register("phone")}
          />
          <Input
            label="Indirizzo"
            autoComplete="off"
            className="sm:col-span-2"
            error={errors.address?.message}
            {...register("address")}
          />
          <Input label="Città" autoComplete="off" error={errors.city?.message} {...register("city")} />
          <Input
            label="CAP"
            inputMode="numeric"
            autoComplete="off"
            error={errors.postalCode?.message}
            {...register("postalCode")}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-xs font-bold uppercase tracking-label text-fg-muted">Squadre e divisa</legend>
        {teams.length > 0 ? (
          <div className="grid gap-x-4 sm:grid-cols-2">
            {teams.map((team) => (
              <Checkbox
                key={team.id}
                label={teamLabel(team)}
                checked={teamIds.includes(team.id)}
                onChange={(event) => toggleTeam(team.id, event.target.checked)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">Non ci sono ancora squadre: potrai assegnarle più avanti.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Ruolo in campo"
            hint="Ad esempio Libero o Schiacciatrice."
            autoComplete="off"
            error={errors.fieldRole?.message}
            {...register("fieldRole")}
          />
          <Input
            label="Taglia divisa"
            hint="Ad esempio S, M o 14 anni."
            autoComplete="off"
            error={errors.kitSize?.message}
            {...register("kitSize")}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-xs font-bold uppercase tracking-label text-fg-muted">Tesseramento</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Iscritto dal" type="date" error={errors.joinedAt?.message} {...register("joinedAt")} />
          {editing ? (
            <Select label="Stato" options={STATUS_OPTIONS} error={errors.status?.message} {...register("status")} />
          ) : null}
        </div>
        <Textarea
          label="Note interne"
          rows={3}
          hint="Non inserire dati sanitari: i certificati vanno caricati tra i documenti."
          error={errors.notes?.message}
          {...register("notes")}
        />
      </fieldset>
    </form>
  );
}

/** Create or edit a member. Server-side errors are mapped back onto the fields. */
export function MemberFormDialog({ open, onOpenChange, teams, member }: MemberFormDialogProps) {
  const [busy, setBusy] = useState(false);
  const editing = Boolean(member);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Modifica tesserato" : "Nuovo tesserato"}
        description={
          editing ? "Aggiorna i dati e le squadre." : "Nome e cognome bastano per iniziare; il resto si completa dopo."
        }
        className="max-w-2xl"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={busy}>
              {editing ? "Salva modifiche" : "Aggiungi tesserato"}
            </Button>
          </>
        }
      >
        <MemberForm teams={teams} member={member} onClose={() => onOpenChange(false)} onBusyChange={setBusy} />
      </DialogContent>
    </Dialog>
  );
}
