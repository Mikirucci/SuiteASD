"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, Switch, Textarea, useToast } from "@/components/ui";
import { toLocalInput } from "@/features/classifiche/format";
import { describeError, useApiMutation } from "@/lib/api";
import { applyFieldErrors } from "@/lib/field-errors";
import {
  PUBLICATION_LABELS,
  createAnnouncementFormSchema,
  defaultPublication,
  publicationOptions,
  toCreateBody,
  toUpdateBody,
  type AnnouncementFormValues,
} from "./schemas";
import type { Announcement, TeamOption } from "./types";

const FORM_ID = "announcement-form";

const PUBLICATION_HINTS = {
  keep: "",
  now: "I destinatari ricevono una notifica.",
  draft: "Solo chi gestisce la bacheca la vede. Nessuna notifica.",
  scheduled: "Compare alla data scelta, senza notifica.",
} as const;

const FIELD_OF_API_PATH: Record<string, Path<AnnouncementFormValues>> = {
  title: "title",
  body: "body",
  teamId: "teamId",
  publishedAt: "scheduledFor",
};

export type AnnouncementDialogState = { mode: "create" } | { mode: "edit"; announcement: Announcement };

function defaultsOf(state: AnnouncementDialogState): AnnouncementFormValues {
  if (state.mode === "create") {
    return { title: "", body: "", teamId: "", isPinned: false, publication: "now", scheduledFor: "" };
  }
  const { announcement } = state;
  return {
    title: announcement.title,
    body: announcement.body,
    teamId: announcement.teamId ?? "",
    isPinned: announcement.isPinned,
    publication: defaultPublication(announcement.status),
    scheduledFor: announcement.status === "SCHEDULED" ? toLocalInput(announcement.publishedAt) : "",
  };
}

interface AnnouncementFormProps {
  state: AnnouncementDialogState;
  teams: readonly TeamOption[];
  onDone: () => void;
}

function AnnouncementForm({ state, teams, onDone }: AnnouncementFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const editing = state.mode === "edit" ? state.announcement : null;
  const schema = useMemo(() => createAnnouncementFormSchema(), []);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementFormValues>({ resolver: zodResolver(schema), defaultValues: defaultsOf(state) });

  const save = useApiMutation(
    (values: AnnouncementFormValues, client) =>
      editing
        ? client.patch<Announcement>(`/announcements/${editing.id}`, toUpdateBody(values))
        : client.post<Announcement>("/announcements", toCreateBody(values)),
    { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements"] }) },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values);
      toast({ title: editing ? "Comunicazione aggiornata" : "Comunicazione salvata", description: saved.title, tone: "success" });
      onDone();
    } catch (error) {
      const marked = applyFieldErrors(error, setError, (path) => FIELD_OF_API_PATH[path.split(".").pop() ?? ""] ?? null);
      setFormError(marked ? "Controlla i campi evidenziati." : describeError(error));
    }
  });

  const publication = useWatch({ control, name: "publication" });
  const audience = [{ value: "", label: "Tutta la società" }, ...teams.map((team) => ({ value: team.id, label: team.name }))];
  const publicationChoices = publicationOptions(editing?.status ?? null).map((value) => ({ value, label: PUBLICATION_LABELS[value] }));

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Input label="Titolo" required autoComplete="off" error={errors.title?.message} {...register("title")} />
        <Textarea label="Testo" required rows={6} error={errors.body?.message} {...register("body")} />
        <Select
          label="A chi è rivolta"
          options={audience}
          hint="Con una squadra, la vedono solo i suoi tesserati e i loro genitori."
          error={errors.teamId?.message}
          {...register("teamId")}
        />
        <Select
          label="Pubblicazione"
          options={publicationChoices}
          hint={PUBLICATION_HINTS[publication] || undefined}
          {...register("publication")}
        />
        {publication === "scheduled" ? (
          <Input label="Data e ora di pubblicazione" type="datetime-local" required error={errors.scheduledFor?.message} {...register("scheduledFor")} />
        ) : null}
        <Switch label="Fissa in alto" hint="Resta in cima alla bacheca, sopra le comunicazioni più recenti." {...register("isPinned")} />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          {editing ? "Salva le modifiche" : "Salva la comunicazione"}
        </Button>
      </div>
    </>
  );
}

export interface AnnouncementDialogProps {
  state: AnnouncementDialogState | null;
  teams: readonly TeamOption[];
  onClose: () => void;
}

export function AnnouncementDialog({ state, teams, onClose }: AnnouncementDialogProps) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={state.mode === "create" ? "Nuova comunicazione" : "Modifica la comunicazione"}
        description="Una sola comunicazione per tutti, al posto dei messaggi sparsi nelle chat."
      >
        <AnnouncementForm
          key={state.mode === "edit" ? state.announcement.id : "new"}
          state={state}
          teams={teams}
          onDone={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
