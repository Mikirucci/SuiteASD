import { formatDay } from "@/lib/format";
import { cn } from "@/lib/cn";
import { templateOf } from "./card-templates";
import type { PromotionCard as PromotionCardData } from "./types";

/** What a card needs to be drawn: the preview of the form has no holder yet, so it passes a sample. */
export type PromotionCardFields = Pick<
  PromotionCardData,
  "title" | "partnerName" | "partnerLabel" | "city" | "badge" | "template" | "validTo" | "societyName" | "holderName" | "representedBy"
>;

export interface PromotionCardProps {
  card: PromotionCardFields;
  /** The logo of the society; without one the card shows its initials. */
  logoUrl?: string | null;
  className?: string;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/**
 * The card of an agreement: the society, the partner and the agreement on top, who holds it and until when at the
 * bottom. The template only changes the background; the information is always in the same places.
 */
export function PromotionCard({ card, logoUrl, className }: PromotionCardProps) {
  const style = templateOf(card.template).style;
  return (
    <article
      aria-label={`Card ${card.title}`}
      style={style}
      className={cn(
        "relative flex min-h-52 w-full flex-col justify-between gap-4 overflow-hidden rounded-xl p-4 shadow-raised sm:aspect-[85.6/54] sm:min-h-0 sm:p-6",
        className,
      )}
    >
      {/* Soft shapes that give the background some depth; the ink never sits on anything but the gradient */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-white/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-12 size-56 rounded-full bg-white/10" />

      <header className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white text-sm font-extrabold text-ink-950">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a small logo from the API, not a page image to optimise
              <img src={logoUrl} alt="" className="size-full object-contain" />
            ) : (
              initialsOf(card.societyName)
            )}
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-extrabold uppercase leading-tight tracking-title">{card.societyName}</p>
            <p className="text-xs font-semibold uppercase tracking-label">Convenzione</p>
          </div>
        </div>
        {card.badge ? (
          <span className="shrink-0 rounded-full border border-current px-3 py-1 text-xs font-extrabold">{card.badge}</span>
        ) : null}
      </header>

      <div className="relative min-w-0">
        {card.partnerLabel || card.city ? (
          <p className="text-xs font-semibold uppercase tracking-label">
            {[card.partnerLabel, card.city].filter((part) => part).join(" · ")}
          </p>
        ) : null}
        <p className="line-clamp-2 text-lg font-extrabold leading-tight tracking-title sm:text-xl">{card.partnerName}</p>
        <p className="line-clamp-2 text-sm font-semibold">{card.title}</p>
      </div>

      <footer className="relative flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-label">Intestatario</p>
          <p className="truncate text-base font-extrabold uppercase">{card.holderName}</p>
          {card.representedBy ? <p className="truncate text-xs font-semibold">Genitore: {card.representedBy}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold uppercase tracking-label">Valida fino al</p>
          <p className="text-base font-extrabold">{formatDay(card.validTo)}</p>
        </div>
      </footer>
    </article>
  );
}
