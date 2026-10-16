"use client";

import { Building2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { hasAdministration, hasPersonalArea } from "@/features/auth/areas";
import { FullPageLoader } from "@/features/auth/guards";
import { AppShell, type AreaLink } from "./app-shell";
import { ADMIN_NAVIGATION, PERSONAL_HOME_HREF, PERSONAL_NAVIGATION } from "./nav-items";

const TO_PERSONAL: AreaLink = { href: PERSONAL_HOME_HREF, label: "La mia area personale", icon: UserRound };
const TO_ADMINISTRATION: AreaLink = { href: "/", label: "Amministrazione", icon: Building2 };

interface FrameProps {
  children: ReactNode;
}

/**
 * Frame of the administration. Somebody who is only an athlete or a guardian has no business here: they go to their
 * personal area. Those who are both get a link to it in the navigation.
 */
export function AdministrationFrame({ children }: FrameProps) {
  const { me } = useAuth();
  const router = useRouter();
  const allowed = me !== null && hasAdministration(me.roles);

  useEffect(() => {
    if (me !== null && !allowed) router.replace(PERSONAL_HOME_HREF);
  }, [me, allowed, router]);

  if (me === null || !allowed) return <FullPageLoader label="Reindirizzamento in corso" />;
  return (
    <AppShell navigation={ADMIN_NAVIGATION} areaLink={hasPersonalArea(me.roles) ? TO_PERSONAL : undefined}>
      {children}
    </AppShell>
  );
}

/** Frame of the personal area of athletes and guardians; staff who are also parents can step back to the administration. */
export function PersonalFrame({ children }: FrameProps) {
  const { me } = useAuth();
  const router = useRouter();
  const allowed = me !== null && hasPersonalArea(me.roles);

  useEffect(() => {
    if (me !== null && !allowed) router.replace("/");
  }, [me, allowed, router]);

  if (me === null || !allowed) return <FullPageLoader label="Reindirizzamento in corso" />;
  return (
    <AppShell navigation={PERSONAL_NAVIGATION} areaLink={hasAdministration(me.roles) ? TO_ADMINISTRATION : undefined}>
      {children}
    </AppShell>
  );
}
