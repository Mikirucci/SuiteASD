import { ChevronRight, Package, UserCheck } from "lucide-react";
import Link from "next/link";
import { ToneCount } from "@/components/ui";
import { formatEuro, pluralize } from "@/lib/format";
import type { KitGroup } from "../types";

export function kitGroupHref(item: string): string {
  return `/altro/divise/${encodeURIComponent(item)}`;
}

/** One item of the wardrobe (every "Maglia gara", every "Tuta"): how many pieces, how many are out and what they cost. The card opens the group. */
export function KitGroupCard({ group }: { group: KitGroup }) {
  return (
    <li className="relative flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft focus-within:ring-2 focus-within:ring-primary hover:-translate-y-0.5 hover:shadow-raised sm:p-5">
      <h3 className="min-w-0 text-base font-bold tracking-title text-fg">
        <Link href={kitGroupHref(group.item)} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
          {group.item}
        </Link>
      </h3>
      <p className="text-sm text-fg-muted">
        {pluralize(group.total, "capo", "capi")}
        {group.totalCostCents > 0 ? ` · costo ${formatEuro(group.totalCostCents)}` : ""}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ToneCount tone="success" icon={UserCheck} count={group.assigned} label="capi assegnati" />
          <ToneCount tone="brand" icon={Package} count={group.inStock} label="capi in magazzino" />
        </div>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
      </div>
    </li>
  );
}
