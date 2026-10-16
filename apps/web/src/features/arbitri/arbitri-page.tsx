"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { EmptyState, SectionHeading, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { usePermission } from "@/hooks/use-permission";
import { AssignmentsPanel } from "./assignments-panel";
import { RefereesPanel } from "./referees-panel";
import type { Referee } from "./types";

type ArbitriTab = "designazioni" | "arbitri";

/** Referees and their designations with fees and refunds. Read by admin, segreteria and staff; written by admin and staff. */
export function ArbitriPage() {
  const canRead = usePermission("referees:read");
  const canWrite = usePermission("referees:write");
  const [tab, setTab] = useState<ArbitriTab>("designazioni");
  // Every referee, for the filter and the designation form (clubs have tens of referees, not thousands)
  const referees = useCursorQuery<Referee>(["referees", "options"], "/referees", { limit: 100 }, { enabled: canRead });

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Arbitri"
        title="Designazioni e rimborsi, sotto controllo."
        highlight="sotto controllo."
        description="Chi arbitra ogni partita, quanto spetta e chi è già stato rimborsato."
      />
      {canRead ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value === "arbitri" ? "arbitri" : "designazioni")}>
          <TabsList aria-label="Sezioni degli arbitri">
            <TabsTrigger className="h-11" value="designazioni">
              Designazioni
            </TabsTrigger>
            <TabsTrigger className="h-11" value="arbitri">
              Arbitri
            </TabsTrigger>
          </TabsList>
          <TabsContent value="designazioni">
            <AssignmentsPanel canWrite={canWrite} referees={referees.items ?? []} refereesFailed={referees.error !== null} />
          </TabsContent>
          <TabsContent value="arbitri">
            <RefereesPanel canWrite={canWrite} />
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState
          icon={Lock}
          title="Arbitri riservati"
          description="Designazioni e rimborsi sono visibili a presidenza, segreteria e staff."
        />
      )}
    </div>
  );
}
