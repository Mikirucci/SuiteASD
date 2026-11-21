"use client";

import { ResourceView } from "./crud/resource-view";
import { KitsOverview } from "./kits/kits-overview";
import { PageShell } from "./page-shell";
import { RelatedLink } from "./related-link";
import { staffConfig } from "./resources/staff";
import { tripsConfig } from "./resources/trips";

export function TripsPage() {
  return (
    <PageShell
      label="Trasferte"
      title="Chi parte, con cosa e quanto costa."
      highlight="quanto costa."
      description="Destinazione, orari, mezzo, posti e costo di ogni trasferta."
      related={<RelatedLink href="/altro/uscite/Trasferte" label="Vedi i costi delle trasferte nelle uscite" />}
    >
      <ResourceView config={tripsConfig} />
    </PageShell>
  );
}

export function KitsPage() {
  return (
    <PageShell
      label="Divise"
      title="Ogni maglia al suo posto."
      highlight="al suo posto."
      description="Un capo per volta: apri una card per vedere taglie, numeri e a chi è assegnato."
      related={<RelatedLink href="/altro/uscite/Divise" label="Vedi i costi delle divise nelle uscite" />}
    >
      <KitsOverview />
    </PageShell>
  );
}

export function StaffPage() {
  return (
    <PageShell
      label="Staff"
      title="Chi guida le squadre."
      highlight="guida le squadre."
      description="Allenatori, dirigenti e qualifiche, con i contatti a portata di mano."
    >
      <ResourceView config={staffConfig} layout="grid" columns={2} />
    </PageShell>
  );
}
