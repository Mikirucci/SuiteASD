import { ArrowRight, Download, Plus, Trash2 } from "lucide-react";
import { Button, ButtonLink, IconButton, type ButtonVariant } from "@/components/ui";
import { ShowcaseSection, Specimen } from "./showcase-section";

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "soft", "ghost", "danger"];

const VARIANT_LABELS: Record<ButtonVariant, string> = {
  primary: "Registra pagamento",
  secondary: "Esporta elenco",
  soft: "Vedi dettagli",
  ghost: "Annulla",
  danger: "Elimina tesserato",
};

export function ActionsSection() {
  return (
    <ShowcaseSection
      id="azioni"
      index={2}
      label="Azioni"
      title="Pulsanti con ogni stato visibile."
      highlight="ogni stato"
      description="Normale, disabilitato e in caricamento. Hover, premuto e focus da tastiera si vedono provandoli."
    >
      <div className="grid gap-8">
        <Specimen caption="Normale" className="flex flex-wrap items-center gap-3">
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {VARIANT_LABELS[variant]}
            </Button>
          ))}
        </Specimen>
        <Specimen caption="Disabilitato" className="flex flex-wrap items-center gap-3">
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} disabled>
              {VARIANT_LABELS[variant]}
            </Button>
          ))}
        </Specimen>
        <Specimen caption="In caricamento" className="flex flex-wrap items-center gap-3">
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} loading>
              {VARIANT_LABELS[variant]}
            </Button>
          ))}
        </Specimen>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Specimen caption="Dimensioni (40, 44, 48 px di altezza)" className="flex flex-wrap items-center gap-3">
          <Button size="sm">Piccolo</Button>
          <Button size="md">Medio</Button>
          <Button size="lg">Grande</Button>
        </Specimen>
        <Specimen caption="Con icona (lucide)" className="flex flex-wrap items-center gap-3">
          <Button leftIcon={<Plus />}>Nuovo tesserato</Button>
          <Button variant="secondary" leftIcon={<Download />}>
            Esporta
          </Button>
          <Button variant="soft" rightIcon={<ArrowRight />}>
            Continua
          </Button>
        </Specimen>
        <Specimen caption="Solo icona (l'etichetta accessibile è obbligatoria)" className="flex flex-wrap items-center gap-3">
          <IconButton aria-label="Elimina" icon={<Trash2 />} />
          <IconButton aria-label="Elimina" variant="danger" icon={<Trash2 />} />
          <IconButton aria-label="Aggiungi" variant="primary" icon={<Plus />} />
          <IconButton aria-label="Aggiungi" variant="secondary" icon={<Plus />} disabled />
        </Specimen>
        <Specimen caption="Link con aspetto di pulsante" className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/login">Vai al login</ButtonLink>
          <ButtonLink href="/registrazione" variant="secondary">
            Registra la società
          </ButtonLink>
        </Specimen>
      </div>
    </ShowcaseSection>
  );
}
