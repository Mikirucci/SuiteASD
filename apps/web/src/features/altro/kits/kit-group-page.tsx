"use client";

import { ArrowLeft, Coins, Package, Shirt, UserCheck } from "lucide-react";
import Link from "next/link";
import { SectionHeading, StatTile } from "@/components/ui";
import { formatEuro, pluralize } from "@/lib/format";
import { ResourceView } from "../crud/resource-view";
import { kitsConfig } from "../resources/kits";
import { useKitGroups } from "./api";

function decodeItem(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function BackLink() {
  return (
    <Link
      href="/altro/divise"
      className="touch-target -ml-2 inline-flex w-fit items-center gap-2 rounded-md px-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Tutte le divise
    </Link>
  );
}

/** One item of the wardrobe: its totals side by side and its pieces as cards, with the search and the filter that only apply here. */
export function KitGroupPage({ item: segment }: { item: string }) {
  const item = decodeItem(segment);
  const groups = useKitGroups();
  const group = groups.data?.data.find((candidate) => candidate.item === item);
  const total = group?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <SectionHeading as="h1" label="Divise" title={item} description={pluralize(total, "capo", "capi")} />
      {groups.data ? (
        <section aria-label="Rendiconto del capo" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Capi" icon={Shirt} value={total} />
          <StatTile label="Assegnati" tone="success" icon={UserCheck} value={group?.assigned ?? 0} note="in mano ai tesserati" />
          <StatTile label="In magazzino" tone="brand" icon={Package} value={group?.inStock ?? 0} note="pronti da consegnare" />
          <StatTile label="Costo" icon={Coins} value={formatEuro(group?.totalCostCents ?? 0)} note="registrato nel bilancio" />
        </section>
      ) : null}
      <ResourceView config={kitsConfig} extraQuery={{ item }} layout="grid" createPresets={{ item }} />
    </div>
  );
}
