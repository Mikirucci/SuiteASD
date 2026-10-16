"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Copy, Link2, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Alert,
  Button,
  Chip,
  ConfirmDialog,
  DataBoundary,
  Dialog,
  DialogClose,
  DialogContent,
  EmptyState,
  Input,
  Select,
  useToast,
  type ChipTone,
} from "@/components/ui";
import { describeError } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { teamLabel } from "@/features/tesserati/document-format";
import type { Team } from "@/features/tesserati/types";
import { useCreateJoinLink, useJoinLinks, useRevokeJoinLink, type CreateJoinLinkBody, type JoinLink, type JoinLinkStatus } from "./api";

const STATUS_CHIPS: Record<JoinLinkStatus, { tone: ChipTone; label: string }> = {
  ACTIVE: { tone: "success", label: "Attivo" },
  EXPIRED: { tone: "neutral", label: "Scaduto" },
  REVOKED: { tone: "neutral", label: "Revocato" },
  EXHAUSTED: { tone: "warning", label: "Esaurito" },
};

const formSchema = z.object({
  teamId: z.string(),
  label: z.string().trim().max(80, "Massimo 80 caratteri"),
  expiresOn: z.string().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Inserisci una data valida"),
  maxUses: z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 10_000), "Da 1 a 10.000"),
});

type FormValues = z.infer<typeof formSchema>;

function usesLine(link: JoinLink): string {
  const count = link.uses === 1 ? "1 iscritto" : `${link.uses} iscritti`;
  return link.maxUses === null ? count : `${count} su ${link.maxUses}`;
}

function CreateForm({ teams }: { teams: readonly Team[] }) {
  const { toast } = useToast();
  const create = useCreateJoinLink();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { teamId: "", label: "", expiresOn: "", maxUses: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // The link works until the end of the chosen day
    const body: CreateJoinLinkBody = {
      ...(values.teamId ? { teamId: values.teamId } : {}),
      ...(values.label ? { label: values.label } : {}),
      ...(values.expiresOn ? { expiresAt: new Date(`${values.expiresOn}T23:59:59`).toISOString() } : {}),
      ...(values.maxUses ? { maxUses: Number(values.maxUses) } : {}),
    };
    try {
      await create.mutateAsync(body);
      reset();
      toast({ title: "Link creato", description: "Copialo e mandalo agli atleti o ai genitori.", tone: "success" });
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Nuovo link di iscrizione" className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Squadra"
          placeholder="Nessuna: la assegni tu dopo"
          options={teams.map((team) => ({ value: team.id, label: teamLabel(team) }))}
          hint="Chi si iscrive entra subito in questa squadra."
          {...register("teamId")}
        />
        <Input label="Nome del link" hint="Facoltativo, per ritrovarlo: ad esempio Open day." maxLength={80} error={errors.label?.message} {...register("label")} />
        <Input label="Valido fino al" type="date" hint="Facoltativo." error={errors.expiresOn?.message} {...register("expiresOn")} />
        <Input label="Iscrizioni consentite" inputMode="numeric" hint="Facoltativo: dopo questo numero il link si chiude." error={errors.maxUses?.message} {...register("maxUses")} />
      </div>
      <div>
        <Button type="submit" leftIcon={<Plus />} loading={create.isPending}>
          Crea il link
        </Button>
      </div>
    </form>
  );
}

function LinkRow({ link, onRevoke }: { link: JoinLink; onRevoke: (link: JoinLink) => void }) {
  const { toast } = useToast();
  const chip = STATUS_CHIPS[link.status];
  const name = link.label ?? "Link senza nome";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      toast({ title: "Link copiato", description: "Incollalo in un messaggio o in una mail.", tone: "success" });
    } catch {
      toast({ title: "Non sono riuscito a copiarlo", description: link.url, tone: "danger" });
    }
  }

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-fg">{name}</p>
          <p className="break-words text-sm text-fg-muted">
            {link.team ? teamLabel(link.team) : "Senza squadra"} · {usesLine(link)}
            {link.expiresAt ? ` · fino al ${formatDay(link.expiresAt.slice(0, 10))}` : ""}
          </p>
        </div>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>
      <p className="break-all rounded-md bg-surface-muted px-3 py-2 text-xs text-fg-muted">{link.url}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Copy />} aria-label={`Copia il link ${name}`} onClick={() => void copy()}>
          Copia il link
        </Button>
        {link.status === "ACTIVE" ? (
          <Button variant="ghost" size="sm" leftIcon={<Ban />} aria-label={`Revoca il link ${name}`} onClick={() => onRevoke(link)}>
            Revoca
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export interface JoinLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: readonly Team[];
}

/** The enrolment links of the society: create one (for a team, with an expiry), copy it, revoke it. */
export function JoinLinksDialog({ open, onOpenChange, teams }: JoinLinksDialogProps) {
  const { toast } = useToast();
  const links = useJoinLinks(open);
  const revoke = useRevokeJoinLink();
  const [revoking, setRevoking] = useState<JoinLink | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        title="Link di iscrizione"
        description="Chi apre il link si registra da solo, nella squadra che scegli: niente da approvare, niente da trascrivere."
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Chiudi</Button>
          </DialogClose>
        }
      >
        <div className="flex flex-col gap-6">
          <CreateForm teams={teams} />
          <section aria-labelledby="join-links-title" className="flex flex-col gap-3 border-t border-line pt-6">
            <h3 id="join-links-title" className="text-sm font-bold text-fg">
              I tuoi link
            </h3>
            <DataBoundary
              isLoading={links.isLoading}
              error={links.error}
              onRetry={() => void links.refetch()}
              isEmpty={links.data?.data.length === 0}
              loadingLabel="Caricamento dei link"
              skeletonRows={2}
              empty={<EmptyState icon={Link2} title="Nessun link ancora" description="Creane uno qui sopra e mandalo agli atleti o ai genitori." />}
            >
              <ul aria-label="Link di iscrizione" className="divide-y divide-line">
                {links.data?.data.map((link) => (
                  <LinkRow key={link.id} link={link} onRevoke={(target) => { revoke.reset(); setRevoking(target); }} />
                ))}
              </ul>
            </DataBoundary>
          </section>
        </div>
        <ConfirmDialog
          open={revoking !== null}
          onOpenChange={(next) => !next && setRevoking(null)}
          title="Revocare il link?"
          description="Smette di funzionare subito. Chi si è già iscritto resta tra i tesserati."
          confirmLabel="Revoca"
          loading={revoke.isPending}
          error={revoke.error ? describeError(revoke.error) : null}
          onConfirm={() => {
            if (!revoking) return;
            revoke.mutate(revoking.id, {
              onSuccess: () => {
                toast({ title: "Link revocato", description: revoking.label ?? "Link senza nome", tone: "success" });
                setRevoking(null);
              },
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
