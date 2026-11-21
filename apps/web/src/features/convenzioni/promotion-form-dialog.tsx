"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch, type UseFormSetValue } from "react-hook-form";
import { Alert, Button, Checkbox, Dialog, DialogClose, DialogContent, Input, Textarea, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { useAllTeams } from "@/features/squadre/api";
import { applyServerErrors } from "@/features/tesserati/server-errors";
import { cn } from "@/lib/cn";
import { useCreatePromotion, useUpdatePromotion } from "./api";
import { CARD_TEMPLATES } from "./card-templates";
import { PromotionCard } from "./promotion-card";
import {
  AUDIENCE_ROLE_OPTIONS,
  emptyPromotionForm,
  formValuesOf,
  promotionFormSchema,
  toCreateBody,
  toUpdateBody,
  type PromotionFormValues,
} from "./promotion-schema";
import type { CardTemplate, Promotion } from "./types";

const FORM_ID = "promotion-form";

const FORM_FIELDS: readonly string[] = [
  "title",
  "partnerName",
  "partnerLabel",
  "city",
  "badge",
  "terms",
  "template",
  "validFrom",
  "validTo",
  "allMembers",
  "teamIds",
  "roles",
];

export interface PromotionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing: the form starts from this promotion. */
  promotion?: Promotion;
}

function toggled<T>(list: readonly T[], value: T, on: boolean): T[] {
  const without = list.filter((item) => item !== value);
  return on ? [...without, value] : without;
}

/** The choice of the background: one button for each template, the chosen one is pressed. */
function TemplatePicker({ value, onChange }: { value: CardTemplate; onChange: (template: CardTemplate) => void }) {
  return (
    <div role="radiogroup" aria-label="Sfondo della card" className="flex flex-wrap gap-3">
      {CARD_TEMPLATES.map((template) => {
        const selected = template.value === value;
        return (
          <button
            key={template.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(template.value)}
            className={cn(
              "flex min-h-11 flex-col items-center gap-1 rounded-md p-1 text-xs font-semibold text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
              selected && "bg-primary-soft",
            )}
          >
            <span aria-hidden="true" style={{ background: template.style.background }} className={cn("h-9 w-14 rounded-sm", selected && "ring-2 ring-primary ring-offset-2")} />
            {template.label}
          </button>
        );
      })}
    </div>
  );
}

function AudienceFields({
  audience,
  setValue,
  teams,
  teamsError,
  error,
}: {
  audience: Pick<PromotionFormValues, "allMembers" | "teamIds" | "roles">;
  setValue: UseFormSetValue<PromotionFormValues>;
  teams: readonly { id: string; name: string }[];
  teamsError: boolean;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-bold text-fg">A chi è rivolta</legend>
      <p className="mb-1 text-sm text-fg-muted">
        Scegli i gruppi che la ricevono: possono essere combinati. Quando la pubblichi, chi la riceve ne è avvisato.
      </p>
      <Checkbox
        label="Tutti i tesserati"
        checked={audience.allMembers}
        onChange={(event) => setValue("allMembers", event.target.checked, { shouldDirty: true })}
      />
      {teamsError ? <Alert tone="danger">Non riesco a caricare le squadre: riprova tra poco.</Alert> : null}
      {teams.map((team) => (
        <Checkbox
          key={team.id}
          label={`Squadra ${team.name}`}
          checked={audience.teamIds.includes(team.id)}
          onChange={(event) => setValue("teamIds", toggled(audience.teamIds, team.id, event.target.checked), { shouldDirty: true })}
        />
      ))}
      {AUDIENCE_ROLE_OPTIONS.map((role) => (
        <Checkbox
          key={role.value}
          label={role.label}
          checked={audience.roles.includes(role.value)}
          onChange={(event) => setValue("roles", toggled(audience.roles, role.value, event.target.checked), { shouldDirty: true })}
        />
      ))}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

interface FormProps {
  promotion?: Promotion;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}

/** The form itself: mounted only while the dialog is open, so it always starts from the current data. */
function PromotionForm({ promotion, onClose, onBusyChange }: FormProps) {
  const { toast } = useToast();
  const auth = useAuth();
  const teams = useAllTeams();
  const create = useCreatePromotion();
  const update = useUpdatePromotion(promotion?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: promotion ? formValuesOf(promotion) : emptyPromotionForm(),
  });
  const [title, partnerName, partnerLabel, city, badge, template, validTo, allMembers, teamIds, roles] = useWatch({
    control,
    name: ["title", "partnerName", "partnerLabel", "city", "badge", "template", "validTo", "allMembers", "teamIds", "roles"],
  });

  const onSubmit = handleSubmit(async (submitted) => {
    setFormError(null);
    onBusyChange(true);
    try {
      if (promotion) {
        await update.mutateAsync(toUpdateBody(submitted));
        toast({ title: "Modifiche salvate", description: submitted.title, tone: "success" });
      } else {
        await create.mutateAsync(toCreateBody(submitted));
        toast({ title: "Bozza salvata", description: "Pubblicala quando è pronta.", tone: "success" });
      }
      onClose();
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, FORM_FIELDS, {
          invalid_dates: { field: "validTo", message: "La fine non può precedere l'inizio" },
          invalid_audience: { field: "teamIds", message: "I destinatari scelti non sono validi" },
        }),
      );
    } finally {
      onBusyChange(false);
    }
  });

  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate className="grid gap-6 p-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Input label="Titolo della convenzione" required autoComplete="off" maxLength={120} hint="Come lo legge chi ha la card, per esempio: Fisioterapia scontata." error={errors.title?.message} {...register("title")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome del partner" required autoComplete="off" maxLength={120} error={errors.partnerName?.message} {...register("partnerName")} />
          <Input label="Tipo di partner" autoComplete="off" maxLength={40} hint="Facoltativo, per esempio: Medical partner." error={errors.partnerLabel?.message} {...register("partnerLabel")} />
          <Input label="Città" autoComplete="off" maxLength={80} error={errors.city?.message} {...register("city")} />
          <Input label="Scritta sulla card" autoComplete="off" maxLength={24} hint="Facoltativa, per esempio: Sconti." error={errors.badge?.message} {...register("badge")} />
        </div>
        <Textarea label="Condizioni" rows={3} maxLength={1000} hint="Facoltative: cosa ottiene chi mostra la card." error={errors.terms?.message} {...register("terms")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Valida dal" type="date" required error={errors.validFrom?.message} {...register("validFrom")} />
          <Input label="Valida fino al" type="date" required error={errors.validTo?.message} {...register("validTo")} />
        </div>
        <AudienceFields
          audience={{ allMembers, teamIds, roles }}
          setValue={setValue}
          teams={teams.data ?? []}
          teamsError={Boolean(teams.error)}
          error={errors.teamIds?.message ?? errors.roles?.message ?? errors.allMembers?.message}
        />
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
        <h3 className="text-sm font-bold text-fg">Anteprima</h3>
        <PromotionCard
          card={{
            title: title.trim() || "Titolo della convenzione",
            partnerName: partnerName.trim() || "Nome del partner",
            partnerLabel: partnerLabel.trim() || null,
            city: city.trim() || null,
            badge: badge.trim() || null,
            template,
            validTo,
            societyName: auth.me?.society.name ?? "La tua società",
            holderName: "Nome Cognome",
            representedBy: null,
          }}
        />
        <TemplatePicker value={template} onChange={(template) => setValue("template", template, { shouldDirty: true })} />
      </div>
    </form>
  );
}

/** Create or edit a promotion; server-side errors are mapped back onto the fields. */
export function PromotionFormDialog({ open, onOpenChange, promotion }: PromotionFormDialogProps) {
  const [busy, setBusy] = useState(false);
  const editing = Boolean(promotion);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl"
        title={editing ? "Modifica la convenzione" : "Nuova convenzione"}
        description={editing ? "Le modifiche valgono subito per chi ha già la card." : "La salvi come bozza: la vede solo l'amministrazione finché non la pubblichi."}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={busy}>
              {editing ? "Salva le modifiche" : "Salva la bozza"}
            </Button>
          </>
        }
      >
        {open ? <PromotionForm promotion={promotion} onClose={() => onOpenChange(false)} onBusyChange={setBusy} /> : null}
      </DialogContent>
    </Dialog>
  );
}
