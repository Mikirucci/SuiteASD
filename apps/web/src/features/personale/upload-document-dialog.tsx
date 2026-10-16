"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, useToast } from "@/components/ui";
import type { DocumentType } from "@/features/tesserati/types";
import { ApiError, describeError } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { UPLOAD_ACCEPT, validateUploadFile } from "@/lib/upload-file";
import { useUploadMemberDocument } from "./api";

const FORM_ID = "upload-document-form";

const formSchema = z.object({
  documentTypeId: z.string().min(1, "Scegli il tipo di documento"),
  expiresAt: z.string().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Inserisci una data valida"),
});

type FormValues = z.infer<typeof formSchema>;

const SERVER_MESSAGES: Record<string, string> = {
  expiry_required: "Questo documento ha una scadenza: inseriscila.",
  expiry_not_applicable: "Questo documento non ha una scadenza.",
  file_content_mismatch: "Il file non sembra un PDF o una foto valida. Prova a salvarlo di nuovo.",
  empty_file: "Il file è vuoto.",
};

function describeUploadError(error: unknown): string {
  if (error instanceof ApiError && error.code) {
    const message = SERVER_MESSAGES[error.code];
    if (message) return message;
  }
  return describeError(error);
}

export interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  /** Whose document it is, for the title ("Documento di Sara Conti"). */
  memberName: string;
  types: readonly DocumentType[];
  /** Type chosen beforehand when the upload starts from a row of the list. */
  presetTypeId?: string;
}

interface FormProps extends Omit<UploadDocumentDialogProps, "open" | "onOpenChange"> {
  onClose: () => void;
}

function UploadForm({ memberId, memberName, types, presetTypeId, onClose }: FormProps) {
  const { toast } = useToast();
  const upload = useUploadMemberDocument(memberId);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { documentTypeId: presetTypeId ?? "", expiresAt: "" },
  });

  const selectedTypeId = useWatch({ control, name: "documentTypeId" });
  const selectedType = types.find((type) => type.id === selectedTypeId);
  const today = toDayKey(new Date());

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    const problem = chosen ? validateUploadFile(chosen) : null;
    setFileError(problem);
    setFile(chosen && !problem ? chosen : null);
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!file) {
      setFileError("Scegli il file da caricare.");
      return;
    }
    const requiresExpiry = selectedType?.requiresExpiry ?? false;
    if (requiresExpiry && values.expiresAt === "") {
      setError("expiresAt", { message: "Inserisci la data di scadenza" });
      return;
    }
    if (requiresExpiry && values.expiresAt < today) {
      setError("expiresAt", { message: "La data è già passata: controlla la scadenza scritta sul documento" });
      return;
    }
    try {
      const saved = await upload.mutateAsync({
        documentTypeId: values.documentTypeId,
        file,
        ...(requiresExpiry ? { expiresAt: values.expiresAt } : {}),
      });
      toast({
        title: "Documento caricato",
        description: `${saved.documentType.name} di ${memberName}: la società lo vede subito.`,
        tone: "success",
      });
      onClose();
    } catch (error) {
      setFormError(describeUploadError(error));
    }
  });

  return (
    <DialogContent
      className="max-w-md"
      title={`Carica un documento · ${memberName}`}
      description="Scegli il tipo e il file: la società lo riceve subito e aggiorna le scadenze da sola."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost">Annulla</Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} leftIcon={<Upload />} loading={upload.isPending}>
            Carica il documento
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Select
          label="Tipo di documento"
          required
          placeholder="Scegli il tipo"
          options={types.map((type) => ({ value: type.id, label: type.name }))}
          error={errors.documentTypeId?.message}
          {...register("documentTypeId")}
        />
        {selectedType?.requiresExpiry ? (
          <Input
            label="Data di scadenza"
            type="date"
            required
            min={today}
            hint="È scritta sul documento."
            error={errors.expiresAt?.message}
            {...register("expiresAt")}
          />
        ) : null}
        <div className="flex flex-col gap-2">
          <label htmlFor="upload-document-file" className="text-sm font-semibold text-fg">
            File <span className="text-danger">*</span>
          </label>
          <input
            id="upload-document-file"
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={onFileChange}
            aria-describedby="upload-document-file-hint"
            aria-invalid={fileError ? true : undefined}
            className="block w-full text-sm text-fg file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-soft file:px-4 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-primary-soft/70"
          />
          <p id="upload-document-file-hint" className={fileError ? "text-sm font-semibold text-danger" : "text-xs text-fg-muted"}>
            {fileError ?? "PDF, JPG o PNG, fino a 5 MB. Una foto fatta con il telefono va bene."}
          </p>
        </div>
      </form>
    </DialogContent>
  );
}

/** Upload of a document by an athlete or a guardian: a type, an expiry when the type has one, and the file. */
export function UploadDocumentDialog({ open, onOpenChange, ...rest }: UploadDocumentDialogProps) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <UploadForm key={`${rest.memberId}:${rest.presetTypeId ?? ""}`} {...rest} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
