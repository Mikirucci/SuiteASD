"use client";

import { BadgePercent, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, ConfirmDialog, DataBoundary, EmptyState, SectionHeading, useToast, type BadgeVariant } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { useAllTeams } from "@/features/squadre/api";
import { usePermission } from "@/hooks/use-permission";
import { describeError } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { useArchivePromotion, useDeletePromotion, usePromotions, usePublishPromotion, useSocietyLogoUrl } from "./api";
import { PromotionCard } from "./promotion-card";
import { PromotionFormDialog } from "./promotion-form-dialog";
import { describeAudience } from "./promotion-schema";
import { SocietyLogoPanel } from "./society-logo-panel";
import type { Promotion, PromotionStatus } from "./types";

const STATUS_LABELS: Record<PromotionStatus, string> = { DRAFT: "Bozza", PUBLISHED: "Pubblicata", ARCHIVED: "Archiviata" };
const STATUS_VARIANTS: Record<PromotionStatus, BadgeVariant> = { DRAFT: "warning", PUBLISHED: "success", ARCHIVED: "neutral" };
/** Published first, then the drafts being prepared, then the ones no longer offered. */
const STATUS_ORDER: Record<PromotionStatus, number> = { PUBLISHED: 0, DRAFT: 1, ARCHIVED: 2 };

type Pending = { action: "publish" | "archive" | "delete"; promotion: Promotion };

const CONFIRMATIONS: Record<Pending["action"], { title: string; confirmLabel: string; tone: "danger" | "primary"; describe: (promotion: Promotion) => string }> = {
  publish: {
    title: "Pubblicare la convenzione?",
    confirmLabel: "Pubblica",
    tone: "primary",
    describe: (promotion) => `«${promotion.title}» diventa visibile a chi la riceve, che ne viene avvisato con una notifica e un'email.`,
  },
  archive: {
    title: "Archiviare la convenzione?",
    confirmLabel: "Archivia",
    tone: "danger",
    describe: (promotion) => `«${promotion.title}» non è più offerta: sparisce dalle card di chi la riceve e resta qui come registrazione.`,
  },
  delete: {
    title: "Eliminare la bozza?",
    confirmLabel: "Elimina",
    tone: "danger",
    describe: (promotion) => `«${promotion.title}» viene cancellata. Non si può annullare.`,
  },
};

function PromotionItem({
  promotion,
  audience,
  logoUrl,
  canWrite,
  onEdit,
  onAsk,
}: {
  promotion: Promotion;
  audience: string;
  logoUrl: string | null;
  canWrite: boolean;
  onEdit: (promotion: Promotion) => void;
  onAsk: (pending: Pending) => void;
}) {
  const auth = useAuth();
  return (
    <li className="flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-soft sm:p-5">
      <PromotionCard
        card={{
          title: promotion.title,
          partnerName: promotion.partnerName,
          partnerLabel: promotion.partnerLabel,
          city: promotion.city,
          badge: promotion.badge,
          template: promotion.template,
          validTo: promotion.validTo,
          societyName: auth.me?.society.name ?? "",
          holderName: "Nome Cognome",
          representedBy: null,
        }}
        logoUrl={logoUrl}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-base font-bold tracking-title text-fg">{promotion.title}</h2>
          <Badge variant={STATUS_VARIANTS[promotion.status]}>{STATUS_LABELS[promotion.status]}</Badge>
        </div>
        <p className="text-sm text-fg-muted">
          {promotion.partnerName} · dal {formatDay(promotion.validFrom)} al {formatDay(promotion.validTo)}
        </p>
        <p className="text-sm text-fg-muted">Per: {audience}</p>
      </div>
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          {promotion.status !== "ARCHIVED" ? (
            <Button variant="secondary" size="sm" onClick={() => onEdit(promotion)}>
              Modifica
            </Button>
          ) : null}
          {promotion.status !== "PUBLISHED" ? (
            <Button size="sm" onClick={() => onAsk({ action: "publish", promotion })}>
              {promotion.status === "ARCHIVED" ? "Pubblica di nuovo" : "Pubblica"}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onAsk({ action: "archive", promotion })}>
              Archivia
            </Button>
          )}
          {promotion.status === "DRAFT" ? (
            <Button variant="ghost" size="sm" onClick={() => onAsk({ action: "delete", promotion })}>
              Elimina
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** The agreements of the society with their cards: prepare, publish, archive. Only the administration sees this page. */
export function PromotionsPage() {
  const canWrite = usePermission("promotions:write");
  const { toast } = useToast();
  const list = usePromotions();
  const teams = useAllTeams();
  const publish = usePublishPromotion();
  const archive = useArchivePromotion();
  const remove = useDeletePromotion();
  const [formOpen, setFormOpen] = useState(false);
  // Kept after the dialog closes so that its closing animation does not flash the "new" form
  const [editing, setEditing] = useState<Promotion | undefined>(undefined);
  const [pending, setPending] = useState<Pending | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const logoUrl = useSocietyLogoUrl(true);

  const teamNames = useMemo(() => new Map((teams.data ?? []).map((team) => [team.id, team.name])), [teams.data]);
  const promotions = useMemo(
    () => [...(list.data ?? [])].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title, "it")),
    [list.data],
  );

  function openForm(promotion?: Promotion) {
    setEditing(promotion);
    setFormOpen(true);
  }

  function ask(next: Pending) {
    setActionError(null);
    setPending(next);
  }

  async function confirm() {
    if (!pending) return;
    const { action, promotion } = pending;
    try {
      if (action === "publish") await publish.mutateAsync(promotion.id);
      if (action === "archive") await archive.mutateAsync(promotion.id);
      if (action === "delete") await remove.mutateAsync(promotion.id);
      toast({
        title: action === "publish" ? "Convenzione pubblicata" : action === "archive" ? "Convenzione archiviata" : "Bozza eliminata",
        description: promotion.title,
        tone: "success",
      });
      setPending(null);
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => openForm()} className="shrink-0">
      Nuova convenzione
    </Button>
  ) : undefined;
  const copy = pending ? CONFIRMATIONS[pending.action] : null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Convenzioni"
        title="Le convenzioni con i partner."
        highlight="convenzioni"
        description="Crea la card di un accordo, scegli a chi è rivolta e pubblicala: chi la riceve la trova nella sua area e ne viene avvisato."
      />
      {canWrite ? <SocietyLogoPanel logoUrl={logoUrl} /> : null}
      {promotions.length > 0 ? <div className="flex justify-end">{newButton}</div> : null}
      <DataBoundary
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        isEmpty={promotions.length === 0}
        empty={
          <EmptyState
            icon={BadgePercent}
            title="Nessuna convenzione ancora"
            description={
              canWrite
                ? "Crea la prima: un accordo con un centro di fisioterapia, un negozio, un'officina. La card ha il logo della società e le condizioni."
                : "La segreteria non ha ancora creato convenzioni."
            }
            action={newButton}
          />
        }
        loadingLabel="Caricamento delle convenzioni"
        skeletonRows={3}
      >
        <ul aria-label="Convenzioni" className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {promotions.map((promotion) => (
            <PromotionItem
              key={promotion.id}
              promotion={promotion}
              audience={describeAudience(promotion, teamNames)}
              logoUrl={logoUrl}
              canWrite={canWrite}
              onEdit={openForm}
              onAsk={ask}
            />
          ))}
        </ul>
      </DataBoundary>

      <PromotionFormDialog open={formOpen} onOpenChange={setFormOpen} promotion={editing} />
      {pending && copy ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={copy.title}
          description={copy.describe(pending.promotion)}
          confirmLabel={copy.confirmLabel}
          tone={copy.tone}
          loading={publish.isPending || archive.isPending || remove.isPending}
          error={actionError}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </div>
  );
}
