"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ChangeEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { describeError } from "@/lib/api";
import { useSaveDocument } from "./api";
import { UPLOAD_ACCEPT, validateUploadFile } from "@/lib/upload-file";
import { applyServerErrors } from "./server-errors";
import type { CreateDocumentBody, DocumentType, MemberDocument, UpdateDocumentBody } from "./types";

const FORM_ID = "document-form";
const FORM_FIELDS = ["documentTypeId", "title", "issuedAt", "expiresAt", "notes"] as const;

const optionalDate = z
  .string()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Inserisci una data valida");

const documentFormSchema = z.object({
  documentTypeId: z.string().min(1, "Scegli il tipo di documento"),
  title: z.string().trim().max(120, "Massimo 120 caratteri"),
  issuedAt: optionalDate,
  expiresAt: optionalDate,
  notes: z.string().trim().max(1000, "Massimo 1000 caratteri"),
});

type DocumentFormValues = z.infer<typeof documentFormSchema>;

function valuesOf(document: MemberDocument | undefined, presetTypeId: string | undefined): DocumentFormValues {
  return {
    documentTypeId: document?.documentType.id ?? presetTypeId ?? "",
    title: document?.title ?? "",
    issuedAt: document?.issuedAt ?? "",
    expiresAt: document?.expiresAt ?? "",
    notes: document?.notes ?? "",
  };
}

const orUndefined = (value: string): string | undefined => (value === "" ? undefined : value);
const orNull = (value: string): string | null => (value === "" ? null : value);

export interface DocumentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  types: readonly DocumentType[];
  /** Present when editing: the type cannot change, the file can be replaced. */
  document?: MemberDocument;
  /** Type preselected when adding a document that is missing. */
  presetTypeId?: string;
}

interface DocumentFormProps {
  memberId: string;
  types: readonly DocumentType[];
  document?: MemberDocument;
  presetTypeId?: string;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}

/** The form itself: mounted only while the dialog is open, so it always starts empty or from the document. */
function DocumentForm({ memberId, types, document, presetTypeId, onClose, onBusyChange }: DocumentFormProps) {
  const editing = Boolean(document);
  const { toast } = useToast();
  const save = useSaveDocument();
  const [formError, setFormError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: valuesOf(document, presetTypeId),
  });

  const selectedTypeId = useWatch({ control, name: "documentTypeId" });
  const selectedType = types.find((type) => type.id === selectedTypeId);
  const expiryHint =
    selectedType?.requiresExpiry && selectedType.validityDays
      ? `Se la lasci vuota, scade ${selectedType.validityDays} giorni dopo il rilascio.`
      : undefined;

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    const problem = chosen ? validateUploadFile(chosen) : null;
    setFileError(problem);
    setFile(chosen && !problem ? chosen : null);
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (fileError) return;
    const requiresExpiry = selectedType?.requiresExpiry ?? false;
    if (requiresExpiry && values.expiresAt === "" && !(values.issuedAt !== "" && selectedType?.validityDays)) {
      setError("expiresAt", { message: "Inserisci la data di scadenza" });
      return;
    }
    if (values.expiresAt !== "" && values.issuedAt !== "" && values.expiresAt < values.issuedAt) {
      setError("expiresAt", { message: "La scadenza non può precedere il rilascio" });
      return;
    }
    const body: CreateDocumentBody | UpdateDocumentBody = document
      ? {
          title: orNull(values.title),
          issuedAt: orNull(values.issuedAt),
          notes: orNull(values.notes),
          ...(requiresExpiry ? { expiresAt: orNull(values.expiresAt) } : {}),
        }
      : {
          documentTypeId: values.documentTypeId,
          title: orUndefined(values.title),
          issuedAt: orUndefined(values.issuedAt),
          notes: orUndefined(values.notes),
          ...(requiresExpiry ? { expiresAt: orUndefined(values.expiresAt) } : {}),
        };
    onBusyChange(true);
    try {
      const result = await save.mutateAsync({ memberId, documentId: document?.id, body, file });
      onClose();
      if (result.uploadError) {
        toast({
          title: "Documento salvato, file non caricato",
          description: `${describeError(result.uploadError)} Riprova dal pulsante «Carica file».`,
          tone: "danger",
        });
      } else {
        toast({ title: editing ? "Documento aggiornato" : "Documento aggiunto", tone: "success" });
      }
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, FORM_FIELDS, {
          expiry_required: { field: "expiresAt", message: "Inserisci la data di scadenza" },
          invalid_dates: { field: "expiresAt", message: "La scadenza non può precedere il rilascio" },
        }),
      );
    } finally {
      onBusyChange(false);
    }
  });

  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-1">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Select
        label="Tipo di documento"
        required
        disabled={editing}
        placeholder="Scegli il tipo"
        options={types.map((type) => ({ value: type.id, label: type.name }))}
        error={errors.documentTypeId?.message}
        {...register("documentTypeId")}
      />
      <Input
        label="Titolo"
        hint="Facoltativo, ad esempio «Certificato agonistico 2026»."
        autoComplete="off"
        error={errors.title?.message}
        {...register("title")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Rilasciato il" type="date" error={errors.issuedAt?.message} {...register("issuedAt")} />
        {selectedType?.requiresExpiry ? (
          <Input
            label="Scade il"
            type="date"
            required={!selectedType.validityDays}
            hint={expiryHint}
            error={errors.expiresAt?.message}
            {...register("expiresAt")}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="document-file" className="text-sm font-semibold text-fg">
          {editing && document?.hasFile ? "Sostituisci il file" : "File"}
        </label>
        <input
          id="document-file"
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={onFileChange}
          aria-describedby="document-file-hint"
          aria-invalid={fileError ? true : undefined}
          className="w-full min-w-0 rounded-md border border-line-control bg-surface text-sm text-fg shadow-soft file:mr-4 file:h-11 file:cursor-pointer file:border-0 file:bg-primary-soft file:px-4 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
        />
        <p id="document-file-hint" className="text-xs text-fg-muted">
          PDF, foto JPG o PNG, fino a 5 MB.
        </p>
        {fileError ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {fileError}
          </p>
        ) : null}
      </div>
      <Textarea
        label="Note interne"
        rows={3}
        hint="Visibili solo alla segreteria. Non scrivere dati sanitari."
        error={errors.notes?.message}
        {...register("notes")}
      />
    </form>
  );
}

/** Add or edit a member document, with an optional PDF/photo upload. */
export function DocumentFormDialog({
  open,
  onOpenChange,
  memberId,
  types,
  document,
  presetTypeId,
}: DocumentFormDialogProps) {
  const [busy, setBusy] = useState(false);
  const editing = Boolean(document);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Modifica documento" : "Aggiungi documento"}
        description="Il file è facoltativo: puoi caricarlo anche dopo."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={busy}>
              {editing ? "Salva modifiche" : "Aggiungi documento"}
            </Button>
          </>
        }
      >
        <DocumentForm
          memberId={memberId}
          types={types}
          document={document}
          presetTypeId={presetTypeId}
          onClose={() => onOpenChange(false)}
          onBusyChange={setBusy}
        />
      </DialogContent>
    </Dialog>
  );
}
