"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PhoneCall, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Card, ConfirmDialog, DataBoundary, Dialog, DialogClose, DialogContent, EmptyState, Input, useToast } from "@/components/ui";
import { applyServerErrors } from "@/features/tesserati/server-errors";
import { describeError } from "@/lib/api";
import {
  useAddEmergencyContact,
  useDeleteEmergencyContact,
  useEmergencyContacts,
  useReplaceEmergencyContact,
  type EmergencyContact,
  type EmergencyContactBody,
} from "./profile-api";
import { emergencyContactSchema, type EmergencyContactValues } from "./profile-schema";

const MAX_CONTACTS = 3;
const FORM_ID = "emergency-contact-form";

function bodyOf(values: EmergencyContactValues): EmergencyContactBody {
  return { name: values.name.trim(), phone: values.phone.trim(), ...(values.relation.trim() ? { relation: values.relation.trim() } : {}) };
}

function ContactDialog({ memberId, contact, onClose }: { memberId: string; contact: EmergencyContact | null; onClose: () => void }) {
  const { toast } = useToast();
  const add = useAddEmergencyContact(memberId);
  const replace = useReplaceEmergencyContact(memberId, contact?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EmergencyContactValues>({
    resolver: zodResolver(emergencyContactSchema),
    defaultValues: { name: contact?.name ?? "", relation: contact?.relation ?? "", phone: contact?.phone ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (contact) await replace.mutateAsync(bodyOf(values));
      else await add.mutateAsync(bodyOf(values));
      toast({ title: contact ? "Contatto aggiornato" : "Contatto aggiunto", tone: "success" });
      onClose();
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, ["name", "relation", "phone"], {
          emergency_contacts_limit: { field: "name", message: `Puoi indicare al massimo ${MAX_CONTACTS} contatti` },
        }),
      );
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={contact ? "Modifica il contatto" : "Nuovo contatto di emergenza"}
        description="Chi chiamare se succede qualcosa durante un allenamento o una partita."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={add.isPending || replace.isPending}>
              {contact ? "Salva le modifiche" : "Aggiungi"}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Input label="Nome e cognome" required maxLength={80} autoComplete="off" error={errors.name?.message} {...register("name")} />
          <Input label="Chi è per te" maxLength={40} autoComplete="off" hint="Per esempio madre, nonno, zia." error={errors.relation?.message} {...register("relation")} />
          <Input label="Telefono" type="tel" required inputMode="tel" autoComplete="off" error={errors.phone?.message} {...register("phone")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Up to three people to call for a member: the athlete (or the parent, for a child) writes them, the segreteria and the
 * administration read them. Nothing else about health is asked here.
 */
export function EmergencyContactsSection({ memberId, ownerName }: { memberId: string; ownerName: string }) {
  const { toast } = useToast();
  const contacts = useEmergencyContacts(memberId);
  const remove = useDeleteEmergencyContact(memberId);
  const [editing, setEditing] = useState<EmergencyContact | null | "new">(null);
  const [deleting, setDeleting] = useState<EmergencyContact | null>(null);
  const items = contacts.data?.data ?? [];
  const full = items.length >= MAX_CONTACTS;

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast({ title: "Contatto eliminato", description: deleting.name, tone: "success" });
      setDeleting(null);
    } catch {
      // The error stays in the dialog (remove.error)
    }
  }

  return (
    <Card as="section" aria-label={`Contatti di emergenza di ${ownerName}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-title text-fg">Contatti di emergenza{ownerName ? `: ${ownerName}` : ""}</h2>
          <p className="text-sm text-fg-muted">Al massimo {MAX_CONTACTS}. Li vedono la segreteria e l&apos;amministrazione.</p>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<Plus />} disabled={full} onClick={() => setEditing("new")}>
          Aggiungi
        </Button>
      </div>
      <DataBoundary
        isLoading={contacts.isLoading}
        error={contacts.error}
        onRetry={() => void contacts.refetch()}
        isEmpty={items.length === 0}
        loadingLabel="Caricamento dei contatti"
        skeletonRows={2}
        empty={<EmptyState icon={PhoneCall} title="Nessun contatto" description="Aggiungi almeno una persona da chiamare in caso di necessità." />}
      >
        <ul aria-label={`Contatti di ${ownerName}`} className="flex flex-col divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg">
                  {item.name}
                  {item.relation ? <span className="font-normal text-fg-muted"> · {item.relation}</span> : null}
                </p>
                <a href={`tel:${item.phone}`} className="text-sm text-primary-fg underline-offset-4 hover:underline">
                  {item.phone}
                </a>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" leftIcon={<Pencil />} aria-label={`Modifica il contatto ${item.name}`} onClick={() => setEditing(item)}>
                  Modifica
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<Trash2 />} aria-label={`Elimina il contatto ${item.name}`} onClick={() => setDeleting(item)}>
                  Elimina
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DataBoundary>
      {editing ? (
        <ContactDialog key={editing === "new" ? "new" : editing.id} memberId={memberId} contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Eliminare il contatto?"
          description={`${deleting.name} non sarà più indicato come contatto di emergenza.`}
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
