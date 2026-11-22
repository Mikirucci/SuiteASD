"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { Alert, Button, useToast } from "@/components/ui";
import { describeError } from "@/lib/api";
import { useRemoveSocietyLogo, useUploadSocietyLogo } from "./api";

const MAX_BYTES = 512 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

/** The logo printed on every card of the society: chosen here once, replaced or taken away when it changes. */
export function SocietyLogoPanel({ logoUrl }: { logoUrl: string | null }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadSocietyLogo();
  const remove = useRemoveSocietyLogo();
  const [error, setError] = useState<string | null>(null);

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Il logo deve essere un'immagine PNG o JPG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Il logo è troppo pesante: al massimo 512 KB.");
      return;
    }
    setError(null);
    try {
      await upload.mutateAsync(file);
      toast({ title: "Logo salvato", description: "Compare su tutte le card.", tone: "success" });
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  async function onRemove() {
    setError(null);
    try {
      await remove.mutateAsync();
      toast({ title: "Logo tolto", tone: "success" });
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  return (
    <section aria-labelledby="society-logo-title" className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small logo from the API, not a page image to optimise
            <img src={logoUrl} alt="Il logo della società" className="size-full object-contain" />
          ) : (
            <ImagePlus aria-hidden="true" className="size-6 text-fg-muted" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="society-logo-title" className="text-base font-bold tracking-title text-fg">
            Logo della società
          </h2>
          <p className="text-sm text-fg-muted">
            {logoUrl
              ? "Compare in alto a sinistra su tutte le card."
              : "Senza un logo le card mostrano le iniziali della società. PNG o JPG, fino a 512 KB."}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={(event) => void onFileChosen(event)}
          tabIndex={-1}
          aria-label="File del logo"
          className="sr-only"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" leftIcon={<ImagePlus />} loading={upload.isPending} onClick={() => inputRef.current?.click()}>
            {logoUrl ? "Sostituisci il logo" : "Carica il logo"}
          </Button>
          {logoUrl ? (
            <Button variant="ghost" size="sm" leftIcon={<Trash2 />} loading={remove.isPending} onClick={() => void onRemove()}>
              Togli il logo
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </section>
  );
}
