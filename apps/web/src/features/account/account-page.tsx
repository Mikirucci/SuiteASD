"use client";

import { SectionHeading } from "@/components/ui";
import { usePermission } from "@/hooks/use-permission";
import { AccountCard } from "./account-card";
import { MyProfileSection } from "./my-profile-form";
import { QualificationsSection } from "./qualifications-section";

/**
 * The account page of the administration: the personal data, the qualifications of whoever works for the society and
 * the sign-in account. Each person sees and changes their own, and nothing of anybody else's.
 */
export function AccountPage() {
  const professional = usePermission("profile:professional");
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Il mio profilo"
        title="I tuoi dati e il tuo accesso."
        highlight="il tuo accesso."
        description="Telefono, indirizzo e dati personali servono alla società per contattarti e, per chi collabora, per i rimborsi. Qui cambi anche la password e controlli dove hai fatto accesso."
      />
      <MyProfileSection />
      {professional ? <QualificationsSection /> : null}
      <AccountCard />
    </div>
  );
}
