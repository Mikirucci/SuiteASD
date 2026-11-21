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
  sponsor: "indigo",
  quote: "emerald",
  contributi: "cyan",
  "eventi e raccolte fondi": "orange",
};

const OTHER_BACKGROUND = "bg-ink-500";

const nameOf = (category: string): string => category.trim().toLocaleLowerCase("it-IT");

function toneOf(category: string): AvatarTone | null {
  const name = nameOf(category);
  if (name === "altro") return null;
  return USUAL_TONES[name] ?? avatarToneOf(name);
}

/** Solid background of the colour of a category: the dot, the tile of its card and of its expenses share it. */
export function categoryBackground(category: string): string {
  const tone = toneOf(category);
  return tone ? avatarToneClasses[tone] : OTHER_BACKGROUND;
}
