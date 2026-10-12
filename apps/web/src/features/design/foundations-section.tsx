import { AppIcon, Card, Logo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ShowcaseSection, Specimen } from "./showcase-section";

interface Swatch {
  name: string;
  className: string;
}

const SCALES: ReadonlyArray<{ title: string; swatches: readonly Swatch[] }> = [
  {
    title: "Brand (blu elettrico)",
    swatches: [
      { name: "50", className: "bg-brand-50" },
      { name: "100", className: "bg-brand-100" },
      { name: "200", className: "bg-brand-200" },
      { name: "400", className: "bg-brand-400" },
      { name: "500", className: "bg-brand-500" },
      { name: "600", className: "bg-brand-600" },
      { name: "700", className: "bg-brand-700" },
      { name: "900", className: "bg-brand-900" },
    ],
  },
  {
    title: "Menta (successo)",
    swatches: [
      { name: "50", className: "bg-mint-50" },
      { name: "100", className: "bg-mint-100" },
      { name: "200", className: "bg-mint-200" },
      { name: "400", className: "bg-mint-400" },
      { name: "500", className: "bg-mint-500" },
      { name: "600", className: "bg-mint-600" },
      { name: "700", className: "bg-mint-700" },
      { name: "900", className: "bg-mint-900" },
    ],
  },
  {
    title: "Ink (neutri blu notte)",
    swatches: [
      { name: "50", className: "bg-ink-50" },
      { name: "100", className: "bg-ink-100" },
      { name: "200", className: "bg-ink-200" },
      { name: "300", className: "bg-ink-300" },
      { name: "450", className: "bg-ink-450" },
      { name: "600", className: "bg-ink-600" },
      { name: "800", className: "bg-ink-800" },
      { name: "900", className: "bg-ink-900" },
    ],
  },
  {
    title: "Avviso, errore, oro",
    swatches: [
      { name: "orange 100", className: "bg-orange-100" },
      { name: "orange 500", className: "bg-orange-500" },
      { name: "orange 700", className: "bg-orange-700" },
      { name: "red 100", className: "bg-red-100" },
      { name: "red 600", className: "bg-red-600" },
      { name: "red 700", className: "bg-red-700" },
      { name: "gold 100", className: "bg-gold-100" },
      { name: "gold 500", className: "bg-gold-500" },
    ],
  },
  {
    title: "Avatar (iniziali bianche, contrasto AA)",
    swatches: [
      { name: "blue", className: "bg-avatar-blue" },
      { name: "amber", className: "bg-avatar-amber" },
      { name: "rose", className: "bg-avatar-rose" },
      { name: "emerald", className: "bg-avatar-emerald" },
      { name: "violet", className: "bg-avatar-violet" },
      { name: "orange", className: "bg-avatar-orange" },
      { name: "cyan", className: "bg-avatar-cyan" },
      { name: "red", className: "bg-avatar-red" },
      { name: "lime", className: "bg-avatar-lime" },
      { name: "indigo", className: "bg-avatar-indigo" },
    ],
  },
];

const TYPE_SCALE = [
  { token: "text-2xl", size: "32 / 40", className: "text-2xl font-extrabold tracking-title", sample: "Tutti i tesserati, in ordine." },
  { token: "text-xl", size: "24 / 32", className: "text-xl font-extrabold tracking-title", sample: "Scadenze sotto controllo." },
  { token: "text-lg", size: "20 / 28", className: "text-lg font-bold tracking-title", sample: "Quote incassate, senza rincorrere." },
  { token: "text-base", size: "16 / 24", className: "text-base", sample: "Promemoria, pagamenti e ricevute gestiti dall'app." },
  { token: "text-sm", size: "14 / 20", className: "text-sm", sample: "Quota novembre, 60 euro, pagata il 3 novembre." },
  { token: "text-xs", size: "12 / 16", className: "text-xs font-semibold", sample: "Aggiornato in automatico" },
] as const;

const SPACING = [
  { token: "1", px: 4 },
  { token: "2", px: 8 },
  { token: "3", px: 12 },
  { token: "4", px: 16 },
  { token: "6", px: 24 },
  { token: "8", px: 32 },
] as const;

const RADII = [
  { token: "rounded-sm", px: "8", use: "Tag, check" },
  { token: "rounded-md", px: "12", use: "Pulsanti, campi" },
  { token: "rounded-lg", px: "16", use: "Card" },
  { token: "rounded-xl", px: "24", use: "Dialog, pannelli" },
  { token: "rounded-full", px: "pill", use: "Pill, chip, avatar" },
] as const;

const SHADOWS = [
  { token: "shadow-soft", use: "Card e righe" },
  { token: "shadow-raised", use: "Hover, popover" },
  { token: "shadow-brand", use: "Pulsante primario" },
  { token: "shadow-overlay", use: "Dialog e drawer" },
] as const;

export function FoundationsSection() {
  return (
    <ShowcaseSection
      id="fondamenta"
      index={1}
      label="Fondamenta"
      title="Colori, testo e spazio, in un solo posto."
      highlight="in un solo posto."
      description="Tutti i valori vivono come token in globals.css. I componenti usano solo i nomi semantici."
    >
      <div className="grid gap-8 md:grid-cols-2">
        {SCALES.map((scale) => (
          <Specimen key={scale.title} caption={scale.title}>
            <ul className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-5">
              {scale.swatches.map((swatch) => (
                <li key={swatch.name} className="flex flex-col gap-1.5">
                  <span className={cn("h-12 rounded-md ring-1 ring-inset ring-ink-900/10", swatch.className)} />
                  <span className="text-xs font-semibold text-fg-muted">{swatch.name}</span>
                </li>
              ))}
            </ul>
          </Specimen>
        ))}
      </div>

      <Specimen caption="Scala tipografica 12 / 14 / 16 / 20 / 24 / 32 (Plus Jakarta Sans)">
        <Card className="flex flex-col gap-4">
          {TYPE_SCALE.map((row) => (
            <div key={row.token} className="grid items-baseline gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <p className="text-xs font-semibold text-fg-muted">
                {row.token} ({row.size})
              </p>
              <p className={row.className}>{row.sample}</p>
            </div>
          ))}
        </Card>
      </Specimen>

      <div className="grid gap-8 md:grid-cols-2">
        <Specimen caption="Spaziatura 4 / 8 / 12 / 16 / 24 / 32">
          <Card className="flex flex-col gap-3">
            {SPACING.map((step) => (
              <div key={step.token} className="flex items-center gap-3 text-xs font-semibold text-fg-muted">
                <span className="w-16">
                  {step.token} ({step.px}px)
                </span>
                <span className="h-3 rounded-full bg-primary" style={{ width: step.px * 4 }} />
              </div>
            ))}
          </Card>
        </Specimen>

        <Specimen caption="Raggi">
          <ul className="grid grid-cols-5 gap-3">
            {RADII.map((radius) => (
              <li key={radius.token} className="flex flex-col items-center gap-2 text-center">
                <span className={cn("size-12 border-2 border-primary bg-primary-soft", radius.token)} />
                <span className="text-xs font-semibold text-fg-muted">{radius.px}</span>
                <span className="text-xs text-fg-subtle">{radius.use}</span>
              </li>
            ))}
          </ul>
        </Specimen>
      </div>

      <Specimen caption="Ombre morbide, tinte di blu (mai nero puro)">
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {SHADOWS.map((shadow) => (
            <li key={shadow.token} className={cn("rounded-lg bg-surface p-4", shadow.token)}>
              <p className="text-sm font-bold">{shadow.token}</p>
              <p className="mt-0.5 text-xs text-fg-muted">{shadow.use}</p>
            </li>
          ))}
        </ul>
      </Specimen>

      <Specimen caption="Logo e icona app">
        <Card className="flex flex-wrap items-center gap-8">
          <Logo size={48} />
          <Logo variant="mark" size={64} />
          <AppIcon size={40} />
          <AppIcon size={24} />
          <p className="text-sm font-semibold text-fg">
            Ordine. Efficienza. <span className="text-primary-fg">Una sola app.</span>
          </p>
        </Card>
      </Specimen>
    </ShowcaseSection>
  );
}
