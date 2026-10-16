"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { MODULES } from "@/config/modules";
import { useAuth } from "@/features/auth/auth-provider";
import { describeRoles } from "@/features/shell/role-labels";
import { usePermission } from "@/hooks/use-permission";
import {
  AutomationsPreview,
  EventsPreview,
  ExpirationsPreview,
  FeesPreview,
  MembersPreview,
  NotificationsPreview,
  StandingsPreview,
} from "./previews";

/** Modules the previews do not cover: a plain door to each. */
const OTHER_MODULE_IDS: readonly string[] = ["pagelle", "altro"];

function Preview({ permission, children, index }: { permission: string; children: ReactNode; index: number }) {
  const allowed = usePermission(permission);
  if (!allowed) return null;
  return (
    <li className="min-w-0">
      <Reveal index={index} className="h-full">
        {children}
      </Reveal>
    </li>
  );
}

/** Home of the administration: what each service says right now, with a way into it. */
export function HomeOverview() {
  const { me } = useAuth();
  if (!me) return null;
  const greeting = `Ciao ${me.user.firstName}, buon lavoro.`;
  const others = MODULES.filter((module) => OTHER_MODULE_IDS.includes(module.id));

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        label={me.society.name}
        title={greeting}
        highlight="buon lavoro."
        description={`Accesso come ${describeRoles(me.roles).toLowerCase()}. Ecco a che punto è ogni servizio.`}
      />
      <ul aria-label="Anteprima dei servizi" className="grid gap-4 lg:grid-cols-2">
        <Preview permission="members:read" index={0}>
          <MembersPreview />
        </Preview>
        <Preview permission="members:read" index={1}>
          <ExpirationsPreview />
        </Preview>
        <Preview permission="payments:read" index={2}>
          <FeesPreview />
        </Preview>
        <Preview permission="events:read" index={3}>
          <EventsPreview />
        </Preview>
        <Preview permission="competitions:read" index={4}>
          <StandingsPreview />
        </Preview>
        <Preview permission="notifications:readOwn" index={5}>
          <NotificationsPreview />
        </Preview>
        <Preview permission="automations:read" index={6}>
          <AutomationsPreview />
        </Preview>
      </ul>
      <nav aria-label="Altre sezioni" className="flex flex-wrap gap-2">
        {others.map((module) => (
          <Link
            key={module.id}
            href={module.href}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-4 text-sm font-semibold text-fg shadow-soft transition-shadow duration-200 ease-soft hover:shadow-raised"
          >
            <module.icon aria-hidden="true" className="size-4 text-primary-fg" />
            {module.label}
            <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
