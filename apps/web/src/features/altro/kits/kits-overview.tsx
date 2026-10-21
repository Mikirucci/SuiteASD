"use client";

import { Coins, Package, Plus, Shirt, UserCheck } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton, StatTile } from "@/components/ui";
import { usePermission } from "@/hooks/use-permission";
import { describeError } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { ResourceFormDialog, type ResourceDialogState } from "../crud/resource-form-dialog";
import { kitsConfig } from "../resources/kits";
import type { Kit } from "../types";
import { useKitGroups } from "./api";
import { KitGroupCard } from "./kit-group-card";

function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento delle divise" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** The wardrobe of the society: totals on top, then one card for each item. The pieces, with search and filters, are inside each card. */
export function KitsOverview() {
  const canWrite = usePermission(kitsConfig.writePermission);
  const groups = useKitGroups();
  const [form, setForm] = useState<ResourceDialogState<Kit> | null>(null);

  if (groups.isLoading) return <OverviewSkeleton />;
  if (groups.error || !groups.data) {
    return <ErrorState title="Divise non disponibili" message={describeError(groups.error)} onRetry={() => void groups.refetch()} />;
  }

  const list = groups.data.data;
  const sum = (pick: (group: (typeof list)[number]) => number) => list.reduce((total, group) => total + pick(group), 0);
  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setForm({ mode: "create" })}>
      {kitsConfig.copy.newLabel}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-8">
      {list.length > 0 ? (
        <section aria-label="Rendiconto delle divise" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Capi" icon={Shirt} value={sum((group) => group.total)} note={pluralize(list.length, "tipo di capo", "tipi di capo")} />
          <StatTile label="Assegnati" tone="success" icon={UserCheck} value={sum((group) => group.assigned)} note="in mano ai tesserati" />
          <StatTile label="In magazzino" tone="brand" icon={Package} value={sum((group) => group.inStock)} note="pronti da consegnare" />
          <StatTile label="Costo" icon={Coins} value={formatEuro(sum((group) => group.totalCostCents))} note="registrato nel bilancio" />
        </section>
      ) : null}

      <section aria-labelledby="kit-groups-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="kit-groups-heading" className="text-lg font-bold tracking-title text-fg">
            Capi
          </h2>
          {list.length > 0 ? newButton : null}
        </div>
        {list.length === 0 ? (
          <EmptyState icon={kitsConfig.icon} title={kitsConfig.copy.emptyTitle} description={kitsConfig.copy.emptyDescription} action={newButton} />
        ) : (
          <ul aria-label="Capi" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((group) => (
              <KitGroupCard key={group.item} group={group} />
            ))}
          </ul>
        )}
      </section>

      <ResourceFormDialog config={kitsConfig} state={form} onClose={() => setForm(null)} />
    </div>
  );
}
