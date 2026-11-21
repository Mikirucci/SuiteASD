"use client";

import { BadgePercent } from "lucide-react";
import { useState } from "react";
import { Badge, DataBoundary, Dialog, DialogContent, DialogClose, Button, EmptyState, SectionHeading } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { useMyCards } from "./api";
import { PromotionCard } from "./promotion-card";
import type { PromotionCard as Card } from "./types";

function cardKey(card: Card): string {
  return `${card.promotionId}:${card.holderMemberId ?? "staff"}`;
}

/** What the partner offers, in words: opens from the card. */
function CardDetailDialog({ card, onClose }: { card: Card | null; onClose: () => void }) {
  if (!card) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={card.title}
        description={`${card.partnerName}${card.city ? ` · ${card.city}` : ""}`}
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Chiudi</Button>
          </DialogClose>
        }
      >
        <div className="flex flex-col gap-4">
          <PromotionCard card={card} />
          <p className="text-sm text-fg">{card.terms ?? "Mostra la card al partner per ottenere l'agevolazione."}</p>
          <p className="text-sm text-fg-muted">
            Valida dal {formatDay(card.validFrom)} al {formatDay(card.validTo)}.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The cards of the signed-in person: one for each agreement meant for them, and one for each child when they are a
 * guardian. The card is shown to the partner as it is: nothing has to be done in the app.
 */
export function MyPromotions() {
  const cards = useMyCards();
  const [open, setOpen] = useState<Card | null>(null);
  const items = cards.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Convenzioni"
        title="Le tue convenzioni."
        highlight="convenzioni"
        description="Mostra la card al partner per ottenere l'agevolazione. Se una convenzione non è ancora valida, la trovi qui con la data di inizio."
      />
      <DataBoundary
        isLoading={cards.isPending}
        error={cards.error}
        onRetry={() => void cards.refetch()}
        isEmpty={items.length === 0}
        empty={
          <EmptyState
            icon={BadgePercent}
            title="Nessuna convenzione per ora"
            description="Quando la società stringe un accordo con un partner e lo rivolge a te, la card compare qui e ti arriva un avviso."
          />
        }
        loadingLabel="Caricamento delle convenzioni"
        skeletonRows={2}
      >
        <ul aria-label="Convenzioni" className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((card) => (
            <li key={cardKey(card)} className="flex flex-col gap-2">
              <PromotionCard card={card} />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setOpen(card)}
                  aria-label={`Mostra i dettagli di ${card.title} per ${card.holderName}`}
                >
                  Mostra i dettagli
                </Button>
                {card.state === "UPCOMING" ? <Badge variant="warning">Valida dal {formatDay(card.validFrom)}</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      </DataBoundary>
      <CardDetailDialog card={open} onClose={() => setOpen(null)} />
    </div>
  );
}
