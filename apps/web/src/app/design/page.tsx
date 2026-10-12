import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { ActionsSection } from "@/features/design/actions-section";
import { DataSection } from "@/features/design/data-section";
import { FeedbackSection } from "@/features/design/feedback-section";
import { FormsSection } from "@/features/design/forms-section";
import { FoundationsSection } from "@/features/design/foundations-section";
import { PeopleSection } from "@/features/design/people-section";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { id: "fondamenta", label: "Fondamenta" },
  { id: "azioni", label: "Azioni" },
  { id: "moduli", label: "Campi" },
  { id: "persone", label: "Persone" },
  { id: "dati", label: "Dati" },
  { id: "feedback", label: "Feedback" },
] as const;

export default function DesignPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="flex flex-col gap-6 border-b border-line pb-8">
        <Link href="/" aria-label="SuiteASD, vai alla home" className="w-fit rounded-md">
          <Logo size={40} />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-title">Design system</h1>
          <p className="mt-1 max-w-prose text-fg-muted">
            Token e componenti di SuiteASD con tutti gli stati. Questa pagina è il riferimento per chi costruisce un nuovo modulo.
          </p>
        </div>
        <nav aria-label="Sezioni della pagina">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex h-10 items-center rounded-full bg-surface px-4 text-sm font-semibold text-fg-muted shadow-soft ring-1 ring-inset ring-line transition-colors hover:text-fg"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="flex flex-col gap-20 py-12">
        <FoundationsSection />
        <ActionsSection />
        <FormsSection />
        <PeopleSection />
        <DataSection />
        <FeedbackSection />
      </main>
    </div>
  );
}
