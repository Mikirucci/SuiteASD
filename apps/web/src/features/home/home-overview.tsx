"use client";

import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { MODULES } from "@/config/modules";
import { useAuth } from "@/features/auth/auth-provider";
import { describeRoles } from "@/features/shell/role-labels";
import type { AvatarTone } from "@/lib/avatar";

const tileToneClasses: Record<AvatarTone, string> = {
  blue: "bg-avatar-blue",
  amber: "bg-avatar-amber",
  rose: "bg-avatar-rose",
  emerald: "bg-avatar-emerald",
  violet: "bg-avatar-violet",
  orange: "bg-avatar-orange",
  cyan: "bg-avatar-cyan",
  red: "bg-avatar-red",
  lime: "bg-avatar-lime",
  indigo: "bg-avatar-indigo",
};

/** Landing page of the private area: who you are and a door to every module. */
export function HomeOverview() {
  const { me } = useAuth();
  if (!me) return null;
  const greeting = `Ciao ${me.user.firstName}, buon lavoro.`;

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        label={me.society.name}
        title={greeting}
        highlight="buon lavoro."
        description={`Accesso come ${describeRoles(me.roles).toLowerCase()}. Scegli da dove iniziare.`}
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MODULES.map((module, index) => (
          <li key={module.id}>
            <Reveal index={index} className="h-full">
              <Link
                href={module.href}
                className="flex h-full flex-col gap-3 rounded-lg bg-surface p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-10 items-center justify-center rounded-md text-white ${tileToneClasses[module.tone]}`}
                >
                  <module.icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-fg">{module.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{module.description}</span>
                </span>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}
