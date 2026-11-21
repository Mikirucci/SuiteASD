import { avatarToneClasses } from "@/components/ui";
import { avatarToneOf, type AvatarTone } from "@/lib/avatar";

/** The usual categories keep the same colour everywhere; the ones the club makes up get one from their name. */
const USUAL_TONES: Readonly<Record<string, AvatarTone>> = {
  palestre: "blue",
  divise: "violet",
  trasferte: "cyan",
  arbitri: "orange",
  "attrezzatura sportiva": "emerald",
  "iscrizioni e affiliazioni": "indigo",
  assicurazioni: "rose",
  utenze: "amber",
  "compensi e rimborsi": "lime",
};

/** The same colours as text colour, for the parts of a chart that are drawn with `currentColor`. */
const TEXT_CLASSES: Record<AvatarTone, string> = {
  blue: "text-avatar-blue",
  amber: "text-avatar-amber",
  rose: "text-avatar-rose",
  emerald: "text-avatar-emerald",
  violet: "text-avatar-violet",
  orange: "text-avatar-orange",
  cyan: "text-avatar-cyan",
  red: "text-avatar-red",
  lime: "text-avatar-lime",
  indigo: "text-avatar-indigo",
};

const OTHER = { background: "bg-ink-500", text: "text-ink-500" } as const;

const nameOf = (category: string): string => category.trim().toLocaleLowerCase("it-IT");

function toneOf(category: string): AvatarTone | null {
  const name = nameOf(category);
  if (name === "altro") return null;
  return USUAL_TONES[name] ?? avatarToneOf(name);
}

/** Solid background of the colour of a category: the dot, the tile of its card and of its expenses share it. */
export function categoryBackground(category: string): string {
  const tone = toneOf(category);
  return tone ? avatarToneClasses[tone] : OTHER.background;
}

/** The colour of a category as text colour: a chart segment drawn in \`currentColor\` takes it. */
export function categoryText(category: string): string {
  const tone = toneOf(category);
  return tone ? TEXT_CLASSES[tone] : OTHER.text;
}
