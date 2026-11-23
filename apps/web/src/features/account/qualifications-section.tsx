"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Award, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Card, Chip, ConfirmDialog, Dialog, DialogClose, DialogContent, EmptyState, Input, useToast } from "@/components/ui";
import { applyServerErrors } from "@/features/tesserati/server-errors";
import { describeError } from "@/lib/api";
import { formatDay } from "@/lib/format";
import {
  useAddQualification,
  useDeleteQualification,
  useMyProfile,
  useReplaceQualification,
  type Qualification,
  type QualificationBody,
} from "./profile-api";
import { qualificationSchema, type QualificationValues } from "./profile-schema";

const MAX_QUALIFICATIONS = 20;
const FORM_ID = "qualification-form";

function bodyOf(values: QualificationValues): QualificationBody {
  return { title: values.title.trim(), issuedOn: values.issuedOn || null, expiresOn: values.expiresOn || null };
}

function QualificationDialog({ qualification, onClose }: { qualification: Qualification | null; onClose: () => void }) {
  const { toast } = useToast();
  const add = useAddQualification();
  const replace = useReplaceQualification(qualification?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<QualificationValues>({
    resolver: zodResolver(qualificationSchema),
    defaultValues: { title: qualification?.title ?? "", issuedOn: qualification?.issuedOn ?? "", expiresOn: qualification?.expiresOn ?? "" },
  });
  const saving = add.isPending || replace.isPending;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (qualification) await replace.mutateAsync(bodyOf(values));
      else await add.mutateAsync(bodyOf(values));
      toast({ title: qualification ? "Qualifica aggiornata" : "Qualifica aggiunta", tone: "success" });
      onClose();
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, ["title", "issuedOn", "expiresOn"], {
          qualifications_limit: { field: "title", message: `Puoi registrare al massimo ${MAX_QUALIFICATIONS} qualifiche` },
        }),
      );
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={qualification ? "Modifica la qualifica" : "Nuova qualifica"}
        description="Un titolo o un corso con le date di rilascio e di scadenza, se ci sono."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={saving}>
              {qualification ? "Salva le modifiche" : "Aggiungi"}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Input label="Titolo" required maxLength={120} autoComplete="off" error={errors.title?.message} {...register("title")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Rilasciata il" type="date" error={errors.issuedOn?.message} {...register("issuedOn")} />
            <Input label="Scade il" type="date" error={errors.expiresOn?.message} {...register("expiresOn")} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Licences and courses of somebody who works for the society; the segreteria and the administration read them too. */
export function QualificationsSection() {
  const { toast } = useToast();
  const profile = useMyProfile();
  const remove = useDeleteQualification();
  const [editing, setEditing] = useState<Qualification | null | "new">(null);
  const [deleting, setDeleting] = useState<Qualification | null>(null);
  const items = profile.data?.qualifications ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const full = items.length >= MAX_QUALIFICATIONS;

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast({ title: "Qualifica eliminata", description: deleting.title, tone: "success" });
      setDeleting(null);
    } catch {
      // The error stays in the dialog (remove.error)
    }
  }

  return (
    <Card as="section" aria-labelledby="qualifications-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="qualifications-title" className="text-lg font-bold tracking-title text-fg">
            Qualifiche e abilitazioni
          </h2>
          <p className="text-sm text-fg-muted">Le vedono solo tu, la segreteria e l&apos;amministrazione.</p>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<Plus />} disabled={full} onClick={() => setEditing("new")}>
          Aggiungi
        </Button>
      </div>
      {profile.data && items.length === 0 ? (
        <EmptyState icon={Award} title="Nessuna qualifica" description="Aggiungi un titolo o un corso, con la scadenza: ti serve per tenerli sotto controllo." />
      ) : null}
      {items.length > 0 ? (
        <ul aria-label="Qualifiche" className="flex flex-col divide-y divide-line">
          {items.map((item) => {
            const expired = item.expiresOn !== undefined && item.expiresOn < today;
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
                    {item.title}
                    {expired ? <Chip tone="danger">Scaduta</Chip> : null}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {item.issuedOn ? `Rilasciata il ${formatDay(item.issuedOn)}` : "Data di rilascio non indicata"}
                    {item.expiresOn ? ` · scade il ${formatDay(item.expiresOn)}` : " · senza scadenza"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" leftIcon={<Pencil />} aria-label={`Modifica la qualifica ${item.title}`} onClick={() => setEditing(item)}>
                    Modifica
                  </Button>
                  <Button variant="ghost" size="sm" leftIcon={<Trash2 />} aria-label={`Elimina la qualifica ${item.title}`} onClick={() => setDeleting(item)}>
                    Elimina
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {editing ? <QualificationDialog key={editing === "new" ? "new" : editing.id} qualification={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Eliminare la qualifica?"
          description={`«${deleting.title}» viene cancellata dal tuo profilo.`}
          confirmLabel="Elimina"
          tone="danger"
          loading={remove.isPending}
          error={remove.error ? describeError(remove.error) : null}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </Card>
  );
}
