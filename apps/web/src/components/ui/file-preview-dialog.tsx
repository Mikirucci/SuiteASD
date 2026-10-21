"use client";

import { Download, FileText } from "lucide-react";
import Image from "next/image";
import { useEffect, useEffectEvent, useState } from "react";
import { describeError, type DownloadedFile } from "@/lib/api";
import { saveFile } from "@/lib/save-file";
import { Button } from "./button";
import { Dialog, DialogContent } from "./dialog";
import { ErrorState } from "./error-state";
import { Skeleton } from "./skeleton";

export interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the file is ("Certificato medico"): dialog title and accessible name of the preview. */
  title: string;
  /** Shown under the title and used for the download when the server suggests no name. */
  fileName: string;
  /** Declared type, used when the downloaded file carries none. */
  mimeType?: string | null;
  /** Fetches the file with the authenticated client (a plain URL cannot send the Bearer token). */
  load: () => Promise<DownloadedFile>;
}

type PreviewKind = "image" | "pdf" | "other";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; file: DownloadedFile; url: string };

function previewKindOf(file: DownloadedFile, declaredType: string | null | undefined): PreviewKind {
  const type = [file.blob.type, declaredType].find((candidate) => candidate && candidate !== "application/octet-stream") ?? "";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  return "other";
}

function PreviewContent({ title, fileName, mimeType, load }: Omit<FilePreviewDialogProps, "open" | "onOpenChange">) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const fetchFile = useEffectEvent(() => load());
  // Radix hands the focus back to its trigger only, and this dialog has none: remember who opened it
  const [openedFrom] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => () => openedFrom?.focus(), [openedFrom]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const file = await fetchFile();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file.blob);
        setState({ status: "ready", file, url: objectUrl });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: describeError(error) });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  const kind = state.status === "ready" ? previewKindOf(state.file, mimeType) : null;
  const label = `Anteprima di ${title}`;

  return (
    <DialogContent
      className="max-w-3xl"
      title={title}
      description={fileName === title ? undefined : fileName}
      footer={
        state.status === "ready" ? (
          <Button
            variant={kind === "other" ? "primary" : "secondary"}
            leftIcon={<Download />}
            onClick={() => saveFile(state.file, fileName)}
          >
            Scarica
          </Button>
        ) : null
      }
    >
      {state.status === "loading" ? (
        <div role="status" aria-busy="true" aria-label="Caricamento dell'anteprima">
          <Skeleton className="h-64 w-full sm:h-96" />
        </div>
      ) : null}
      {state.status === "error" ? (
        <ErrorState
          className="bg-surface-muted py-8 shadow-none"
          title="Anteprima non riuscita"
          message={state.message}
          onRetry={retry}
        />
      ) : null}
      {state.status === "ready" && kind === "image" ? (
        <div className="relative h-[60dvh] w-full rounded-md bg-surface-muted">
          {/* A blob address of an authenticated download: nothing for the image optimiser to fetch */}
          <Image src={state.url} alt={label} fill unoptimized className="object-contain p-2" />
        </div>
      ) : null}
      {state.status === "ready" && kind === "pdf" ? (
        <iframe src={state.url} title={label} className="h-[60dvh] w-full rounded-md border border-line bg-surface" />
      ) : null}
      {state.status === "ready" && kind === "other" ? (
        <div className="flex flex-col items-center rounded-md bg-surface-muted px-6 py-8 text-center">
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-md bg-primary-soft text-primary-fg">
            <FileText className="size-6" />
          </span>
          <p className="mt-4 text-base font-bold text-fg">Anteprima non disponibile per questo tipo di file</p>
          <p className="mt-1 max-w-sm text-sm text-fg-muted">Scaricalo per aprirlo sul tuo dispositivo.</p>
        </div>
      ) : null}
    </DialogContent>
  );
}

/**
 * Looks at a file inside the platform: image, PDF, or a download prompt for other types.
 * The file is fetched through `load` only while the dialog is open and its temporary address is released on close.
 */
export function FilePreviewDialog({ open, onOpenChange, ...content }: FilePreviewDialogProps) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <PreviewContent {...content} />
    </Dialog>
  );
}
