"use client";

import { FileText, FileUp, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, DataBoundary, EmptyState, SectionHeading } from "@/components/ui";
import { documentHeading } from "@/features/tesserati/document-format";
import { DocumentItem } from "@/features/tesserati/document-item";
import { DocumentSummary } from "@/features/tesserati/document-summary";
import { useDocumentTypes, useMember, useMemberDocuments } from "@/features/tesserati/api";
import type { DocumentIndicator, MemberDocument } from "@/features/tesserati/types";
import { useSubjectChoice } from "./subject-picker";
import { usePersonalSubjects, type Subject } from "./subjects";
import { UploadDocumentDialog } from "./upload-document-dialog";

interface RowProps {
  indicator: DocumentIndicator;
  document: MemberDocument | undefined;
  onUpload: (typeId: string) => void;
}

function DocumentRow({ indicator, document, onUpload }: RowProps) {
  const isMissing = indicator.status === "MISSING";
  const needsAction = indicator.status !== "OK";
  const name = indicator.name;
  return (
    <DocumentItem
      heading={documentHeading(name, document?.title ?? null)}
      typeName={name}
      status={indicator.status}
      expiresAt={indicator.expiresAt}
      daysRemaining={indicator.daysRemaining}
      note={isMissing ? "Non ancora caricato" : "In regola"}
      document={document}
      actions={
        <Button
          variant={needsAction ? "primary" : "ghost"}
          size="sm"
          leftIcon={<FileUp />}
          aria-label={`${isMissing ? "Carica" : "Carica la nuova versione di"} ${name}`}
          onClick={() => onUpload(indicator.documentTypeId)}
        >
          {isMissing ? "Carica" : "Carica la nuova versione"}
        </Button>
      }
    />
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
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold tracking-title text-fg">{subject.isSelf ? "I tuoi documenti" : `Documenti di ${subject.name}`}</h2>
        {member.data ? <DocumentSummary indicators={member.data.documents} /> : null}
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
            className="shadow-none"
            icon={FileText}
            title="Nessun documento richiesto"
            description="La società non ha ancora indicato i documenti da consegnare. Puoi comunque caricarne uno."
            action={
              <Button variant="secondary" leftIcon={<Upload />} onClick={() => setUpload({})}>
                Carica un documento
              </Button>
            }
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
