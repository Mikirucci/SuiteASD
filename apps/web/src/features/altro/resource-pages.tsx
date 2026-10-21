"use client";

import { ResourceView } from "./crud/resource-view";
import { KitsOverview } from "./kits/kits-overview";
import { PageShell } from "./page-shell";
import { sponsorsConfig } from "./resources/sponsors";
import { staffConfig } from "./resources/staff";
import { tripsConfig } from "./resources/trips";
import { venuesConfig } from "./resources/venues";

export function VenuesPage() {
  return (
    <PageShell
      label="Palestre"
      title="Dove ci alleniamo e giochiamo."
      highlight="giochiamo."
      description="Indirizzi, capienza e orari di disponibilità degli impianti."
    >
      <ResourceView config={venuesConfig} />
    </PageShell>
  );
}

export function TripsPage() {
  return (
    <PageShell
      label="Trasferte"
      title="Chi parte, con cosa e quanto costa."
      highlight="quanto costa."
      description="Destinazione, orari, mezzo, posti e costo di ogni trasferta."
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
    >
      <KitsOverview />
    </PageShell>
  );
}

export function SponsorsPage() {
  return (
    <PageShell
      label="Sponsor"
      title="Contratti e scadenze sotto controllo."
      highlight="sotto controllo."
      description="Importi, scadenze e referenti di chi sostiene la società."
    >
      <ResourceView config={sponsorsConfig} />
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
