"use client";

import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { EmptyState, Reveal, SectionHeading } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { ALTRO_SECTIONS } from "./sections";

/** Hub of the secondary modules: a 3-column grid with the sections the user is allowed to open. */
export function AltroPage() {
  const { me } = useAuth();
  const sections = ALTRO_SECTIONS.filter((section) => me?.permissions.includes(section.permission));

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        label="Altro"
        title="Tutto quello che serve, in un posto solo."
        highlight="in un posto solo."
        description="Palestre, trasferte, divise, sponsor, bilancio e il resto della vita della società."
      />
      {sections.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nessuna sezione disponibile"
          description="Il tuo ruolo non ha accesso a queste sezioni. Se serve, chiedi alla segreteria."
        />
      ) : (
        <ul aria-label="Sezioni" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sections.map((section, index) => (
            <li key={section.slug}>
              <Reveal index={index} className="h-full">
                <Link
                  href={section.href}
                  className="flex h-full min-h-28 flex-col gap-3 rounded-lg bg-surface p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised"
                >
                  <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary-fg">
                    <section.icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-fg">{section.label}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{section.description}</span>
                  </span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
