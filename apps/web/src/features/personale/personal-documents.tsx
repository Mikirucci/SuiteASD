"use client";

import { Download, FilePlus2, FileText, FileUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, DataBoundary, EmptyState, SectionHeading, useToast } from "@/components/ui";
import { describeExpiry, formatDateOnly } from "@/features/tesserati/document-format";
import { DocumentSummary } from "@/features/tesserati/document-summary";
import { DocumentStatusChip } from "@/features/tesserati/document-status-chip";
import { useDocumentTypes, useDownloadDocument, useMember, useMemberDocuments } from "@/features/tesserati/api";
import type { DocumentIndicator, MemberDocument } from "@/features/tesserati/types";
import { describeError } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { useSubjectChoice } from "./subject-picker";
import { usePersonalSubjects, type Subject } from "./subjects";
import { UploadDocumentDialog } from "./upload-document-dialog";

function detailLine(indicator: DocumentIndicator): string {
  if (indicator.status === "MISSING") return "Non ancora caricato";
  if (indicator.expiresAt && indicator.daysRemaining !== null) {
    return `Scade il ${formatDateOnly(indicator.expiresAt)} · ${describeExpiry(indicator.daysRemaining)}`;
  }
  return "In regola";
}

interface RowProps {
  indicator: DocumentIndicator;
  document: MemberDocument | undefined;
  onUpload: (typeId: string) => void;
}

function DocumentRow({ indicator, document, onUpload }: RowProps) {
  const { toast } = useToast();
  const download = useDownloadDocument();
  const needsAction = indicator.status !== "OK";
  const hasFile = Boolean(document?.downloadUrl);
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">{indicator.name}</p>
          <p className="mt-0.5 text-sm text-fg-muted">{detailLine(indicator)}</p>
          {document?.hasFile && document.fileName ? (
            <p className="mt-0.5 text-xs text-fg-muted">
              {document.fileName}
              {document.sizeBytes ? ` · ${formatFileSize(document.sizeBytes)}` : ""}
            </p>
          ) : null}
        </div>
        <DocumentStatusChip status={indicator.status} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={needsAction ? "primary" : "secondary"}
          size="sm"
          leftIcon={<FileUp />}
          aria-label={`${indicator.status === "MISSING" ? "Carica" : "Carica la nuova versione di"} ${indicator.name}`}
          onClick={() => onUpload(indicator.documentTypeId)}
        >
          {indicator.status === "MISSING" ? "Carica" : "Carica la nuova versione"}
        </Button>
        {document && hasFile ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download />}
            loading={download.isPending}
            aria-label={`Scarica ${indicator.name}`}
            onClick={() =>
              download.mutate(document, {
                onError: (error) => toast({ title: "Download non riuscito", description: describeError(error), tone: "danger" }),
              })
            }
          >
            Scarica
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function SubjectDocuments({ subject }: { subject: Subject }) {
  const member = useMember(subject.memberId);
  const documents = useMemberDocuments(subject.memberId);
  const types = useDocumentTypes();
  const [upload, setUpload] = useState<{ typeId?: string } | null>(null);

  const documentById = useMemo(() => new Map((documents.data?.data ?? []).map((document) => [document.id, document])), [documents.data]);
  const indicators = member.data?.documents ?? [];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold tracking-title text-fg">{subject.isSelf ? "I tuoi documenti" : `Documenti di ${subject.name}`}</h2>
          {member.data ? <DocumentSummary indicators={member.data.documents} /> : null}
        </div>
        <Button variant="secondary" size="sm" leftIcon={<FilePlus2 />} onClick={() => setUpload({})}>
          Carica un altro documento
        </Button>
      </div>

      <DataBoundary
        isLoading={member.isLoading || documents.isLoading}
        error={member.error ?? documents.error}
        onRetry={() => {
          void member.refetch();
          void documents.refetch();
        }}
        isEmpty={indicators.length === 0}
        loadingLabel="Caricamento dei documenti"
        skeletonRows={3}
        empty={
          <EmptyState
            icon={FileText}
            title="Nessun documento richiesto"
            description="La società non ha ancora indicato i documenti da consegnare. Puoi comunque caricarne uno."
          />
        }
      >
        <ul aria-label={`Documenti richiesti${subject.isSelf ? "" : ` per ${subject.name}`}`} className="divide-y divide-line">
          {indicators.map((indicator) => (
            <DocumentRow
              key={indicator.documentTypeId}
              indicator={indicator}
              document={indicator.documentId ? documentById.get(indicator.documentId) : undefined}
              onUpload={(typeId) => setUpload({ typeId })}
            />
          ))}
        </ul>
      </DataBoundary>

      <UploadDocumentDialog
        open={upload !== null}
        onOpenChange={(open) => !open && setUpload(null)}
        memberId={subject.memberId}
        memberName={subject.name}
        types={types.data?.data ?? []}
        presetTypeId={upload?.typeId}
      />
    </Card>
  );
}

/** Documents of the athlete (or of each child): what is on file, what is missing, and the upload that fixes it. */
export function PersonalDocuments() {
  const subjects = usePersonalSubjects();
  const { subject, picker } = useSubjectChoice(subjects);
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Documenti"
        title="Carica una volta, la società vede subito."
        highlight="la società vede subito."
        description="Certificato medico, modulo di iscrizione e privacy: quando carichi un documento, scadenze e promemoria si aggiornano da soli."
      />
      {picker}
      {subject ? (
        <SubjectDocuments key={subject.memberId} subject={subject} />
      ) : (
        <EmptyState
          icon={FileText}
          title="Nessun tesserato collegato al tuo account"
          description="Chiedi alla segreteria della società di collegare il tuo profilo, oppure iscriviti con il link che ti hanno dato."
        />
      )}
    </div>
  );
}
