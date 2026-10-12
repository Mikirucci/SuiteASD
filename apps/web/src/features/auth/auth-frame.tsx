import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { SectionHeading } from "@/components/ui/section-heading";

const AUTOMATIONS = [
  "Ricordare le quote",
  "Controllare i certificati",
  "Inviare le convocazioni",
  "Aggiornare le classifiche",
  "Emettere le ricevute",
  "Avvisare atleti e genitori",
] as const;

/** Two-column frame for login and registration: brand promise on large screens, form always. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between p-12 lg:flex xl:p-16">
        <Logo size={44} />
        <div className="flex max-w-md flex-col gap-8">
          <SectionHeading
            label="Gestione delegata"
            title="Tu pensi alla squadra. Al resto, l'app."
            highlight="Al resto, l'app."
            description="Le attività ripetitive si gestiscono da sole. Ogni automazione è visibile e puoi disattivarla quando vuoi."
            as="h2"
          />
          <ul className="flex flex-col gap-3">
            {AUTOMATIONS.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm font-semibold text-fg">
                <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-mint-700 text-white">
                  <Check className="size-3.5" strokeWidth={3.5} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm font-semibold text-fg-muted">Ordine. Efficienza. Una sola app.</p>
      </aside>
      <main id="main" className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="flex w-full max-w-md flex-col gap-8">
          <Logo size={40} className="lg:hidden" />
          <Card padding="lg" className="rounded-xl">
            {children}
          </Card>
        </div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-extrabold tracking-title text-fg sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-fg-muted">{description}</p>
    </div>
  );
}
